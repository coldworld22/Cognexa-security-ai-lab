import { execFile } from "child_process";
import { AsyncLocalStorage } from "async_hooks";
import * as http from "http";
import * as https from "https";
import { isIP, Socket } from "net";
import * as net from "net";
import { Logger } from "pino";
import * as tls from "tls";
import { Readable } from "stream";
import { urlToHttpOptions } from "url";
import { promisify } from "util";

import {
  ConnectionIdentity,
  LeakTestResult
} from "../private-mode/private-mode.types";
import { AppError } from "../../utils/app-error";

type SocketConnectCallback = () => void;
type ClientResponseCallback = (
  response: http.IncomingMessage
) => void;

interface TorSessionDescriptor {
  workspaceId: string;
  torSocksPort?: number;
}

interface ProxyManagerServiceOptions {
  logger?: Logger;
  now?: () => Date;
  platform?: NodeJS.Platform;
  manageOperatingSystemBrowserProxy?: boolean;
  getTorSession?: (workspaceId: string) => Promise<TorSessionDescriptor | null>;
  readSystemBrowserProxyState?: () => Promise<SystemBrowserProxyState | null>;
  writeSystemBrowserProxyState?: (
    state: SystemBrowserProxyState
  ) => Promise<void>;
}

export interface BrowserProxySettings {
  server: string;
  bypassList: string;
  hostResolverRules: string;
  launchArgs: string[];
}

export interface SystemBrowserProxyState {
  enabled: boolean;
  server: string | null;
  override: string | null;
  autoConfigUrl: string | null;
  autoDetect: boolean;
}

interface ActiveProxyState {
  workspaceId: string;
  torSocksPort: number;
  proxyUrl: string;
  enabledAt: string;
}

interface NormalizedSocketConnectOptions {
  host?: string;
  port?: number;
  path?: string;
  localAddress?: string;
  localPort?: number;
  family?: number;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  noDelay?: boolean;
  signal?: AbortSignal;
  timeout?: number;
}

interface NormalizedSocketConnectInput {
  callback?: SocketConnectCallback;
  options: NormalizedSocketConnectOptions;
  originalArgs: unknown[];
}

interface NormalizedRequestInput {
  callback?: ClientResponseCallback;
  options: http.RequestOptions;
  url?: URL;
}

interface IpApiIdentityResponse {
  ip?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country_name?: string;
  country_code?: string;
  timezone?: string;
  org?: string;
  asn?: string;
  version?: string;
}

interface IpAddressResponse {
  ip?: string;
}

interface TorStatusResponse {
  IP?: string;
  IsTor?: boolean;
}

const DEFAULT_NO_PROXY_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "::1",
  ".localhost",
  ".local",
  ".localdomain",
  ".docker.internal",
  ".internal",
  ".home.arpa"
];

const SOCKS_VERSION = 0x05;
const SOCKS_COMMAND_CONNECT = 0x01;
const SOCKS_AUTH_NONE = 0x00;
const SOCKS_ATYP_IPV4 = 0x01;
const SOCKS_ATYP_DOMAIN = 0x03;
const SOCKS_ATYP_IPV6 = 0x04;
const netModule = require("node:net") as typeof import("node:net");
const tlsModule = require("node:tls") as typeof import("node:tls");
const httpModule = require("node:http") as typeof import("node:http");
const httpsModule = require("node:https") as typeof import("node:https");
const execFileAsync = promisify(execFile);

export class ProxyManagerService {
  private readonly now: () => Date;
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly manageOperatingSystemBrowserProxy: boolean;
  private readonly getTorSessionResolver?: (
    workspaceId: string
  ) => Promise<TorSessionDescriptor | null>;
  private readonly readSystemBrowserProxyStateImpl?: () => Promise<SystemBrowserProxyState | null>;
  private readonly writeSystemBrowserProxyStateImpl?: (
    state: SystemBrowserProxyState
  ) => Promise<void>;
  private readonly bypassContext = new AsyncLocalStorage<{ enabled: true }>();
  private readonly originalFetch =
    typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
  private readonly originalSocketConnect = netModule.Socket.prototype.connect;
  private readonly originalNetConnect = netModule.connect;
  private readonly originalNetCreateConnection = netModule.createConnection;
  private readonly originalTlsConnect = tlsModule.connect;
  private readonly originalHttpRequest = httpModule.request;
  private readonly originalHttpGet = httpModule.get;
  private readonly originalHttpsRequest = httpsModule.request;
  private readonly originalHttpsGet = httpsModule.get;
  private readonly originalHttpAgentCreateConnection =
    httpModule.Agent.prototype.createConnection;
  private readonly originalHttpsAgentCreateConnection =
    httpsModule.Agent.prototype.createConnection;
  private readonly originalEnv = new Map<string, string | undefined>();
  private readonly mutableNet = netModule as typeof netModule & {
    connect: typeof net.connect;
    createConnection: typeof net.createConnection;
  };
  private readonly mutableTls = tlsModule as typeof tlsModule & {
    connect: typeof tls.connect;
  };
  private readonly mutableHttp = httpModule as typeof httpModule & {
    request: typeof http.request;
    get: typeof http.get;
  };
  private readonly mutableHttps = httpsModule as typeof httpsModule & {
    request: typeof https.request;
    get: typeof https.get;
  };

  private activeState: ActiveProxyState | null = null;
  private originalSystemBrowserProxyState: SystemBrowserProxyState | null | undefined;
  private patched = false;
  private disposed = false;

  constructor(options: ProxyManagerServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.manageOperatingSystemBrowserProxy =
      options.manageOperatingSystemBrowserProxy ?? false;
    this.getTorSessionResolver = options.getTorSession;
    this.readSystemBrowserProxyStateImpl = options.readSystemBrowserProxyState;
    this.writeSystemBrowserProxyStateImpl = options.writeSystemBrowserProxyState;
  }

  async enableSystemProxy(workspaceId: string): Promise<void> {
    const session = await this.getTorSession(workspaceId);
    const torSocksPort = session.torSocksPort ?? 9050;

    this.ensurePatched();
    this.activeState = {
      workspaceId,
      torSocksPort,
      proxyUrl: `socks5h://127.0.0.1:${torSocksPort}`,
      enabledAt: this.now().toISOString()
    };
    this.applyEnvironmentOverrides(this.activeState.proxyUrl);
    if (this.manageOperatingSystemBrowserProxy) {
      await this.applyOperatingSystemBrowserProxy(this.activeState.proxyUrl);
    }

    this.logger?.info(
      {
        workspaceId,
        torSocksPort
      },
      "Enabled the process-wide Tor SOCKS proxy for Private Mode"
    );
  }

  async disableSystemProxy(workspaceId?: string): Promise<void> {
    if (!this.activeState) {
      this.restoreEnvironmentOverrides();
      return;
    }

    if (workspaceId && this.activeState.workspaceId !== workspaceId) {
      return;
    }

    this.activeState = null;
    this.restoreEnvironmentOverrides();
    if (this.manageOperatingSystemBrowserProxy) {
      await this.restoreOperatingSystemBrowserProxy();
    }
    this.logger?.info("Disabled the process-wide Private Mode proxy");
  }

  async runWithoutProxy<T>(work: () => Promise<T>): Promise<T> {
    return this.bypassContext.run({ enabled: true }, work);
  }

  isEnabledForWorkspace(workspaceId: string): boolean {
    return this.activeState?.workspaceId === workspaceId;
  }

  getBrowserProxySettings(workspaceId: string): BrowserProxySettings | null {
    if (!this.isEnabledForWorkspace(workspaceId) || !this.activeState) {
      return null;
    }

    return {
      server: `socks5://127.0.0.1:${this.activeState.torSocksPort}`,
      bypassList: "<-loopback>",
      hostResolverRules:
        "MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1 , EXCLUDE ::1",
      launchArgs: [
        `--proxy-server=socks5://127.0.0.1:${this.activeState.torSocksPort}`,
        "--proxy-bypass-list=<-loopback>",
        "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1 , EXCLUDE ::1"
      ]
    };
  }

  async verifyNoLeaks(workspaceId: string): Promise<LeakTestResult> {
    const testedAt = this.now().toISOString();
    const leaks: string[] = [];

    if (!this.isEnabledForWorkspace(workspaceId)) {
      leaks.push("system_proxy_inactive");
    }

    const [directIdentity, exitIdentity, torStatus] = await Promise.all([
      this.runWithoutProxy(() => this.fetchConnectionIdentity(this.requireFetch())),
      this.fetchConnectionIdentity(this.requireFetch()).catch(() => null),
      this.fetchTorStatus(this.requireFetch()).catch(() => ({
        ip: null,
        isTor: null
      }))
    ]);
    const observedExitIp = exitIdentity?.ip ?? torStatus.ip ?? null;
    const observedTorExit =
      exitIdentity?.isTorExit === true || torStatus.isTor === true ? true : false;
    const normalizedExitIdentity =
      exitIdentity || torStatus.ip
        ? {
            ...(exitIdentity ?? this.createEmptyConnectionIdentity()),
            ip: observedExitIp,
            isTorExit: observedTorExit
          }
        : null;

    if (!observedExitIp) {
      leaks.push("exit_ip_unavailable");
    }

    if (!observedTorExit) {
      leaks.push("tor_exit_unconfirmed");
    }

    if (
      directIdentity?.ip &&
      observedExitIp &&
      directIdentity.ip === observedExitIp
    ) {
      leaks.push("exit_ip_matches_direct_path");
    }

    return {
      testedAt,
      strategy: "tor",
      directIp: directIdentity?.ip ?? null,
      exitIp: observedExitIp,
      exitRegion: normalizedExitIdentity?.country ?? normalizedExitIdentity?.region ?? null,
      dnsTransport: this.activeState ? "system" : "local",
      isTorExit: observedTorExit,
      leaks,
      directIdentity,
      exitIdentity: normalizedExitIdentity,
      verificationCategory: "external_url_access",
      transportVerified: Boolean(
        this.isEnabledForWorkspace(workspaceId) &&
          observedTorExit &&
          observedExitIp &&
          directIdentity?.ip !== observedExitIp
      ),
      advisories: ["webrtc_not_applicable_in_node_runtime"]
    };
  }

  private createEmptyConnectionIdentity(): ConnectionIdentity {
    return {
      ip: null,
      city: null,
      region: null,
      country: null,
      countryCode: null,
      timezone: null,
      organization: null,
      asn: null,
      network: "unknown",
      isTorExit: null
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activeState = null;
    this.restoreEnvironmentOverrides();
    if (this.manageOperatingSystemBrowserProxy) {
      void this.restoreOperatingSystemBrowserProxy().catch((error) => {
        this.logger?.warn(
          {
            error
          },
          "Failed to restore the operating-system browser proxy during disposal"
        );
      });
    }

    if (!this.patched) {
      return;
    }

    this.mutableNet.connect = this.originalNetConnect;
    this.mutableNet.createConnection = this.originalNetCreateConnection;
    this.mutableTls.connect = this.originalTlsConnect;
    this.mutableHttp.request = this.originalHttpRequest;
    this.mutableHttp.get = this.originalHttpGet;
    this.mutableHttps.request = this.originalHttpsRequest;
    this.mutableHttps.get = this.originalHttpsGet;
    httpModule.Agent.prototype.createConnection = this.originalHttpAgentCreateConnection;
    httpsModule.Agent.prototype.createConnection = this.originalHttpsAgentCreateConnection;
    httpModule.globalAgent.createConnection = this.originalHttpAgentCreateConnection;
    httpsModule.globalAgent.createConnection = this.originalHttpsAgentCreateConnection;

    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }

    this.patched = false;
  }

  private ensurePatched(): void {
    if (this.patched) {
      return;
    }

    this.patchFetch();
    this.patchNetConnect();
    this.patchTlsConnect();
    this.patchAgentConnections();
    this.patchHttpModules();

    this.patched = true;
  }

  private patchFetch(): void {
    const originalFetch = this.originalFetch;
    if (!originalFetch) {
      return;
    }

    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      if (!this.activeState || this.bypassContext.getStore()?.enabled) {
        return originalFetch(input, init);
      }

      const request =
        input instanceof Request && init === undefined
          ? input.clone()
          : new Request(input, init);
      const url = new URL(request.url);

      if (!["http:", "https:"].includes(url.protocol) || this.shouldBypassHost(url.hostname)) {
        return originalFetch(input, init);
      }

      return this.fetchThroughPatchedHttp(request);
    }) as typeof globalThis.fetch;
  }

  private patchNetConnect(): void {
    this.mutableNet.connect = ((...args: unknown[]) => {
      const normalized = this.normalizeSocketConnectArgs(args);
      if (!this.shouldProxySocket(normalized.options)) {
        return this.originalNetConnect.apply(netModule, args as never);
      }

      const socket = new Socket();
      const failure = new AppError(
        "Direct public TCP sockets are blocked while the Private Mode system proxy is active. Use the HTTP(S) or browser transports so the runtime can enforce Tor tunneling.",
        502,
        {
          host: normalized.options.host ?? null,
          port: normalized.options.port ?? null
        }
      );

      if (normalized.callback) {
        socket.once("connect", normalized.callback);
      }

      queueMicrotask(() => {
        socket.destroy(failure);
      });

      return socket;
    }) as typeof net.connect;

    this.mutableNet.createConnection = this.mutableNet.connect;
  }

  private patchTlsConnect(): void {
    this.mutableTls.connect = ((...args: unknown[]) => {
      const callback =
        typeof args.at(-1) === "function"
          ? (args.pop() as () => void)
          : undefined;
      const target =
        args[0] instanceof Object && !Array.isArray(args[0]) && !(args[0] instanceof Buffer)
          ? ({ ...(args[0] as tls.ConnectionOptions) } satisfies tls.ConnectionOptions)
          : ({
              port: typeof args[0] === "number" ? args[0] : undefined,
              host: typeof args[1] === "string" ? args[1] : undefined
            } satisfies tls.ConnectionOptions);

      if (
        this.activeState &&
        !this.shouldBypassHost(target.host ?? target.servername)
      ) {
        throw new AppError(
          "Direct public TLS sockets are blocked while the Private Mode system proxy is active. Use the HTTP(S) or browser transports so the runtime can enforce Tor tunneling.",
          500,
          {
            host: target.host ?? target.servername ?? null
          }
        );
      }

      if (callback) {
        args.push(callback);
      }

      return this.originalTlsConnect.apply(tls, args as never);
    }) as typeof tls.connect;
  }

  private patchAgentConnections(): void {
    const manager = this;
    httpModule.Agent.prototype.createConnection = (function patchedHttpAgentConnect(
      this: http.Agent,
      options: http.ClientRequestArgs,
      callback?: (error: Error | null, socket: Socket) => void
    ) {
      const host = manager.extractConnectionHost(options);
      if (!host || !manager.shouldProxyHostForRequests(host)) {
        return (manager.originalHttpAgentCreateConnection as unknown as (
          this: http.Agent,
          options: http.ClientRequestArgs,
          callback?: (error: Error | null, socket: Socket) => void
        ) => Socket | null | undefined).call(this, options, callback);
      }

      if (!callback) {
        throw new AppError(
          "HTTP proxy tunneling requires the Node agent createConnection callback.",
          500
        );
      }

      manager.openSocksTunnel(
        manager.normalizeSocketConnectArgs([options]).options,
        (socket) => callback(null, socket),
        (error, socket) => callback(error, socket)
      );
      return null;
    }) as typeof httpModule.Agent.prototype.createConnection;

    httpsModule.Agent.prototype.createConnection = (function patchedHttpsAgentConnect(
      this: https.Agent,
      options: http.ClientRequestArgs,
      callback?: (error: Error | null, socket: tls.TLSSocket) => void
    ) {
      const host = manager.extractConnectionHost(options);
      if (!host || !manager.shouldProxyHostForRequests(host)) {
        return (manager.originalHttpsAgentCreateConnection as unknown as (
          this: https.Agent,
          options: http.ClientRequestArgs,
          callback?: (error: Error | null, socket: tls.TLSSocket) => void
        ) => tls.TLSSocket | null | undefined).call(this, options, callback);
      }

      if (!callback) {
        throw new AppError(
          "HTTPS proxy tunneling requires the Node agent createConnection callback.",
          500
        );
      }

      manager.openSocksTunnel(
        manager.normalizeSocketConnectArgs([options]).options,
        (rawSocket) => {
          const tlsSocket = (manager.originalTlsConnect as unknown as (
            connectionOptions: tls.ConnectionOptions
          ) => tls.TLSSocket)({
            ...(options as tls.ConnectionOptions),
            socket: rawSocket,
            servername:
              (options as tls.ConnectionOptions).servername ??
              manager.normalizeHostname(
                (options as tls.ConnectionOptions).host ??
                  String((options as { host?: string | null }).host ?? "")
              ) ??
              undefined
          });

          tlsSocket.once("secureConnect", () => callback(null, tlsSocket));
          tlsSocket.once("error", (error) => callback(error, tlsSocket));
        },
        (error, rawSocket) => callback(error, rawSocket as unknown as tls.TLSSocket)
      );
      return null;
    }) as typeof httpsModule.Agent.prototype.createConnection;

    httpModule.globalAgent.createConnection = httpModule.Agent.prototype.createConnection;
    httpsModule.globalAgent.createConnection =
      httpsModule.Agent.prototype.createConnection;
  }

  private patchHttpModules(): void {
    this.mutableHttp.request = ((...args: unknown[]) =>
      this.requestThroughPatchedSocket("http", args)) as typeof http.request;
    this.mutableHttp.get = ((...args: unknown[]) => {
      const request = this.requestThroughPatchedSocket("http", args);
      request.end();
      return request;
    }) as typeof http.get;

    this.mutableHttps.request = ((...args: unknown[]) =>
      this.requestThroughPatchedSocket("https", args)) as typeof https.request;
    this.mutableHttps.get = ((...args: unknown[]) => {
      const request = this.requestThroughPatchedSocket("https", args);
      request.end();
      return request;
    }) as typeof https.get;
  }

  private requestThroughPatchedSocket(
    protocol: "http" | "https",
    args: unknown[]
  ): http.ClientRequest {
    const normalized = this.normalizeRequestArgs(protocol, args);
    const host =
      normalized.options.hostname ??
      normalized.options.host?.toString().split(":")[0] ??
      normalized.url?.hostname;

    if (!host || !this.shouldProxyHostForRequests(host)) {
      return protocol === "https"
        ? this.originalHttpsRequest.apply(https, args as never)
        : this.originalHttpRequest.apply(http, args as never);
    }

    const options: http.RequestOptions = {
      ...normalized.options,
      agent: false,
      lookup: undefined
    };

    if (protocol === "https") {
      options.createConnection = ((connectionOptions, callback) => {
        if (!callback) {
          throw new AppError(
            "HTTPS proxy tunneling requires the Node createConnection callback.",
            500
          );
        }

        this.openSocksTunnel(
          this.normalizeSocketConnectArgs([connectionOptions]).options,
          (rawSocket) => {
            const tlsSocket = (this.originalTlsConnect as unknown as (
              options: tls.ConnectionOptions
            ) => tls.TLSSocket)({
              ...(connectionOptions as tls.ConnectionOptions),
              socket: rawSocket,
              servername:
                (connectionOptions as tls.ConnectionOptions).servername ??
                this.normalizeHostname(
                  (connectionOptions as tls.ConnectionOptions).host ??
                    String((connectionOptions as { host?: string | null }).host ?? "")
                ) ??
                undefined
            });

            tlsSocket.once("secureConnect", () => callback(null, tlsSocket));
            tlsSocket.once("error", (error) => callback(error, tlsSocket));
          },
          (error, rawSocket) => callback(error, rawSocket)
        );
        return null;
      }) as http.RequestOptions["createConnection"];
    } else {
      options.createConnection = ((connectionOptions, callback) => {
        if (!callback) {
          throw new AppError(
            "HTTP proxy tunneling requires the Node createConnection callback.",
            500
          );
        }

        this.openSocksTunnel(
          this.normalizeSocketConnectArgs([connectionOptions]).options,
          (rawSocket) => callback(null, rawSocket),
          (error, rawSocket) => callback(error, rawSocket)
        );
        return null;
      }) as http.RequestOptions["createConnection"];
    }

    return protocol === "https"
      ? (this.originalHttpsRequest as unknown as (
          options: http.RequestOptions,
          callback?: ClientResponseCallback
        ) => http.ClientRequest)(options, normalized.callback)
      : (this.originalHttpRequest as unknown as (
          options: http.RequestOptions,
          callback?: ClientResponseCallback
        ) => http.ClientRequest)(options, normalized.callback);
  }

  private async fetchThroughPatchedHttp(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const redirectMode = request.redirect;
    const headers = new Headers(request.headers);
    const method = request.method.toUpperCase();
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer());

    return new Promise<Response>((resolve, reject) => {
      const client = url.protocol === "https:" ? this.mutableHttps : this.mutableHttp;
      const nodeRequest = client.request(url, {
        method,
        headers: Object.fromEntries(headers.entries()),
        agent: false
      });

      const abort = () => {
        nodeRequest.destroy(new Error("The fetch request was aborted."));
      };

      if (request.signal.aborted) {
        abort();
        return;
      }

      request.signal.addEventListener("abort", abort, { once: true });
      nodeRequest.once("error", reject);
      nodeRequest.once("response", (response) => {
        request.signal.removeEventListener("abort", abort);

        const statusCode = response.statusCode ?? 200;
        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          redirectMode !== "manual"
        ) {
          const location = response.headers.location;
          response.resume();

          if (!location) {
            reject(
              new AppError("Proxy fetch received a redirect without a Location header.", 502)
            );
            return;
          }

          if (redirectMode === "error") {
            reject(
              new AppError("Proxy fetch rejected a redirect response.", 502, {
                location
              })
            );
            return;
          }

          resolve(
            this.fetchThroughPatchedHttp(
              new Request(new URL(location, url).toString(), {
                method:
                  statusCode === 303 && method !== "HEAD" ? "GET" : request.method,
                headers,
                redirect: request.redirect
              })
            )
          );
          return;
        }

        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) {
              responseHeaders.append(name, entry);
            }
            continue;
          }

          if (typeof value === "string") {
            responseHeaders.set(name, value);
          }
        }

        const bodyStream =
          method === "HEAD" || [204, 304].includes(statusCode)
            ? null
            : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
        const proxiedResponse = new Response(bodyStream, {
          status: statusCode,
          headers: responseHeaders
        });
        Object.defineProperty(proxiedResponse, "url", {
          configurable: true,
          value: url.toString()
        });

        resolve(proxiedResponse);
      });

      if (body) {
        nodeRequest.write(body);
      }

      nodeRequest.end();
    });
  }

  private openSocksTunnel(
    options: NormalizedSocketConnectOptions,
    onReady: (socket: Socket) => void,
    onError: (error: Error, socket: Socket) => void
  ): Socket {
    const state = this.activeState;
    const socket = (this.originalNetConnect as unknown as (
      options: net.NetConnectOpts
    ) => Socket)({
      host: "127.0.0.1",
      port: state?.torSocksPort ?? 9050,
      family: 4,
      localAddress: options.localAddress,
      localPort: options.localPort
    });
    let settled = false;
    let buffer = Buffer.alloc(0);
    let stage: "greeting" | "connect" = "greeting";

    this.prepareSocketBeforeConnect(socket, options);

    const cleanup = () => {
      socket.removeListener("connect", handleConnect);
      socket.removeListener("data", handleData);
      socket.removeListener("error", handleError);
      socket.removeListener("timeout", handleTimeout);
    };

    const finishWithError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      onError(error, socket);
      socket.destroy(error);
    };

    const handleTimeout = () => {
      finishWithError(new AppError("Timed out while opening the Tor SOCKS tunnel.", 502));
    };

    const handleError = (error: Error) => {
      finishWithError(error);
    };

    const handleConnect = () => {
      socket.write(Buffer.from([SOCKS_VERSION, 0x01, SOCKS_AUTH_NONE]));
    };

    const handleData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        if (stage === "greeting") {
          if (buffer.length < 2) {
            return;
          }

          const [version, method] = buffer;
          buffer = buffer.subarray(2);
          if (version !== SOCKS_VERSION || method !== SOCKS_AUTH_NONE) {
            finishWithError(
              new AppError(
                "Tor SOCKS proxy rejected the authentication handshake.",
                502
              )
            );
            return;
          }

          socket.write(this.buildSocksConnectRequest(options));
          stage = "connect";
          continue;
        }

        const responseLength = this.getSocksResponseLength(buffer);
        if (responseLength === null || buffer.length < responseLength) {
          return;
        }

        const response = buffer.subarray(0, responseLength);
        buffer = buffer.subarray(responseLength);
        if (response[1] !== 0x00) {
          finishWithError(
            new AppError(
              "Tor SOCKS proxy could not open the requested outbound connection.",
              502,
              {
                replyCode: response[1]
              }
            )
          );
          return;
        }

        settled = true;
        cleanup();
        if (buffer.length > 0) {
          socket.unshift(buffer);
          buffer = Buffer.alloc(0);
        }
        onReady(socket);
        return;
      }
    };

    socket.on("connect", handleConnect);
    socket.on("data", handleData);
    socket.on("error", handleError);
    socket.on("timeout", handleTimeout);

    return socket;
  }

  private normalizeSocketConnectArgs(
    args: unknown[]
  ): NormalizedSocketConnectInput {
    const callback =
      typeof args.at(-1) === "function"
        ? (args.at(-1) as SocketConnectCallback)
        : undefined;
    const inputArgs = callback ? args.slice(0, -1) : args;
    const first = inputArgs[0];

    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      return {
        callback,
        options: { ...(first as net.NetConnectOpts) },
        originalArgs: callback ? [first] : [...inputArgs]
      };
    }

    if (typeof first === "string" && inputArgs.length === 1) {
      return {
        callback,
        options: {
          path: first
        },
        originalArgs: callback ? [first] : [...inputArgs]
      };
    }

    return {
      callback,
      options: {
        port: typeof first === "number" ? first : undefined,
        host:
          typeof inputArgs[1] === "string"
            ? (inputArgs[1] as string)
            : undefined
      },
      originalArgs: callback ? inputArgs : [...inputArgs]
    };
  }

  private normalizeRequestArgs(
    protocol: "http" | "https",
    args: unknown[]
  ): NormalizedRequestInput {
    const callback =
      typeof args.at(-1) === "function"
        ? (args.at(-1) as ClientResponseCallback)
        : undefined;
    const inputArgs = callback ? args.slice(0, -1) : args;
    const first = inputArgs[0];
    const second = inputArgs[1];

    if (first instanceof URL) {
      return {
        callback,
        url: first,
        options: {
          ...urlToHttpOptions(first),
          ...(second && typeof second === "object" ? (second as http.RequestOptions) : {}),
          protocol: `${protocol}:`
        }
      };
    }

    if (typeof first === "string") {
      try {
        const parsed = new URL(first);
        return {
          callback,
          url: parsed,
          options: {
            ...urlToHttpOptions(parsed),
            ...(second && typeof second === "object"
              ? (second as http.RequestOptions)
              : {}),
            protocol: `${protocol}:`
          }
        };
      } catch {
        return {
          callback,
          options: {
            ...(second && typeof second === "object"
              ? (second as http.RequestOptions)
              : {}),
            path: first,
            protocol: `${protocol}:`
          }
        };
      }
    }

    return {
      callback,
      options:
        first && typeof first === "object"
          ? ({
              ...(first as http.RequestOptions),
              protocol: (first as http.RequestOptions).protocol ?? `${protocol}:`
            } satisfies http.RequestOptions)
          : {
              protocol: `${protocol}:`
      }
    };
  }

  private extractConnectionHost(options: http.ClientRequestArgs): string | undefined {
    return (
      (typeof options.hostname === "string" ? options.hostname : undefined) ??
      (typeof options.host === "string" ? options.host.split(":")[0] : undefined)
    );
  }

  private shouldProxySocket(options: NormalizedSocketConnectOptions): boolean {
    if (!this.activeState || this.bypassContext.getStore()?.enabled) {
      return false;
    }

    if (options.path) {
      return false;
    }

    return !this.shouldBypassHost(options.host);
  }

  private shouldProxyHostForRequests(hostname: string): boolean {
    if (!this.activeState || this.bypassContext.getStore()?.enabled) {
      return false;
    }

    return !this.shouldBypassHost(hostname);
  }

  private shouldBypassHost(hostname: string | undefined): boolean {
    if (!hostname) {
      return true;
    }

    const normalized = this.normalizeHostname(hostname);
    if (!normalized) {
      return true;
    }

    if (this.matchesNoProxy(normalized)) {
      return true;
    }

    const family = isIP(normalized);
    if (family === 4) {
      return this.isPrivateIpv4(normalized);
    }

    if (family === 6) {
      return this.isPrivateIpv6(normalized);
    }

    // Single-label hostnames are usually local service discovery or Docker service names.
    if (!normalized.includes(".")) {
      return true;
    }

    return false;
  }

  private prepareSocketBeforeConnect(
    socket: Socket,
    options: NormalizedSocketConnectOptions
  ): void {
    if (options.noDelay !== undefined) {
      socket.setNoDelay(options.noDelay);
    }

    if (options.keepAlive !== undefined) {
      socket.setKeepAlive(
        options.keepAlive,
        options.keepAliveInitialDelay
      );
    }

    if (options.timeout && options.timeout > 0) {
      socket.setTimeout(options.timeout);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        socket.destroy(new Error("The socket connection was aborted."));
        return;
      }

      const abort = () => socket.destroy(new Error("The socket connection was aborted."));
      options.signal.addEventListener("abort", abort, { once: true });
      socket.once("close", () => {
        options.signal?.removeEventListener("abort", abort);
      });
    }
  }

  private connectSocketThroughSocks(
    socket: Socket,
    options: NormalizedSocketConnectOptions
  ): void {
    const state = this.activeState;
    if (!state) {
      this.originalSocketConnect.apply(socket, [options] as never);
      return;
    }

    const originalEmit = socket.emit;
    let handshakeComplete = false;
    let handshakeBuffer = Buffer.alloc(0);
    let stage: "greeting" | "connect" = "greeting";
    const handshakeDataListener = () => undefined;

    const fail = (error: unknown) => {
      handshakeComplete = true;
      socket.emit = originalEmit;
      socket.removeListener("data", handshakeDataListener);
      const failure =
        error instanceof Error
          ? error
          : new AppError("Failed to establish the Tor SOCKS connection.", 502);
      queueMicrotask(() => {
        originalEmit.call(socket, "error", failure);
        socket.destroy(failure);
      });
    };

    const finalize = () => {
      handshakeComplete = true;
      socket.emit = originalEmit;
      socket.removeListener("data", handshakeDataListener);
      if (socket.listenerCount("data") === 0) {
        socket.pause();
      }
      originalEmit.call(socket, "connect");
    };

    socket.on("data", handshakeDataListener);
    socket.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (handshakeComplete) {
        return originalEmit.call(socket, event, ...args);
      }

      if (event === "connect") {
        socket.write(Buffer.from([SOCKS_VERSION, 0x01, SOCKS_AUTH_NONE]));
        return true;
      }

      if (event === "data") {
        const chunk = args[0];
        const data =
          chunk instanceof Buffer ? chunk : Buffer.from(String(chunk), "binary");
        handshakeBuffer = Buffer.concat([handshakeBuffer, data]);

        while (true) {
          if (stage === "greeting") {
            if (handshakeBuffer.length < 2) {
              return true;
            }

            const [version, method] = handshakeBuffer;
            handshakeBuffer = handshakeBuffer.subarray(2);
            if (version !== SOCKS_VERSION || method !== SOCKS_AUTH_NONE) {
              fail(
                new AppError(
                  "Tor SOCKS proxy rejected the authentication handshake.",
                  502
                )
              );
              return true;
            }

            socket.write(this.buildSocksConnectRequest(options));
            stage = "connect";
            continue;
          }

          const responseLength = this.getSocksResponseLength(handshakeBuffer);
          if (responseLength === null || handshakeBuffer.length < responseLength) {
            return true;
          }

          const response = handshakeBuffer.subarray(0, responseLength);
          handshakeBuffer = handshakeBuffer.subarray(responseLength);
          if (response[1] !== 0x00) {
            fail(
              new AppError(
                "Tor SOCKS proxy could not open the requested outbound connection.",
                502,
                {
                  replyCode: response[1]
                }
              )
            );
            return true;
          }

          finalize();
          if (handshakeBuffer.length > 0) {
            originalEmit.call(socket, "data", handshakeBuffer);
            handshakeBuffer = Buffer.alloc(0);
          }
          return true;
        }

        return true;
      }

      return originalEmit.call(socket, event, ...args);
    }) as typeof socket.emit;

    this.originalSocketConnect.apply(
      socket,
      [
        {
          host: "127.0.0.1",
          port: state.torSocksPort,
          family: 4,
          localAddress: options.localAddress,
          localPort: options.localPort
        } satisfies net.NetConnectOpts
      ] as never
    );
  }

  private buildSocksConnectRequest(
    options: NormalizedSocketConnectOptions
  ): Buffer {
    const port = Math.max(0, Math.min(65535, options.port ?? 0));
    const portBytes = Buffer.from([(port >> 8) & 0xff, port & 0xff]);
    const host = this.normalizeHostname(options.host);

    if (!host) {
      throw new AppError("A remote host is required for the SOCKS proxy tunnel.", 500);
    }

    const family = isIP(host);
    if (family === 4) {
      return Buffer.concat([
        Buffer.from([SOCKS_VERSION, SOCKS_COMMAND_CONNECT, 0x00, SOCKS_ATYP_IPV4]),
        Buffer.from(host.split(".").map((segment) => Number(segment))),
        portBytes
      ]);
    }

    if (family === 6) {
      return Buffer.concat([
        Buffer.from([SOCKS_VERSION, SOCKS_COMMAND_CONNECT, 0x00, SOCKS_ATYP_IPV6]),
        this.encodeIpv6(host),
        portBytes
      ]);
    }

    const hostBuffer = Buffer.from(host, "utf8");
    if (hostBuffer.length > 255) {
      throw new AppError("The proxy target hostname is too long.", 500, {
        host
      });
    }

    return Buffer.concat([
      Buffer.from([
        SOCKS_VERSION,
        SOCKS_COMMAND_CONNECT,
        0x00,
        SOCKS_ATYP_DOMAIN,
        hostBuffer.length
      ]),
      hostBuffer,
      portBytes
    ]);
  }

  private getSocksResponseLength(buffer: Buffer): number | null {
    if (buffer.length < 5) {
      return null;
    }

    const atyp = buffer[3];
    if (atyp === SOCKS_ATYP_IPV4) {
      return 10;
    }

    if (atyp === SOCKS_ATYP_IPV6) {
      return 22;
    }

    if (atyp === SOCKS_ATYP_DOMAIN) {
      const length = buffer[4];
      if (length === undefined) {
        return null;
      }
      return buffer.length >= 5 + length + 2 ? 5 + length + 2 : null;
    }

    return null;
  }

  private encodeIpv6(address: string): Buffer {
    const [head, tail = ""] = address.toLowerCase().split("::");
    const headParts = head ? head.split(":").filter(Boolean) : [];
    const tailParts = tail ? tail.split(":").filter(Boolean) : [];
    const missing = 8 - (headParts.length + tailParts.length);
    const expanded = [
      ...headParts,
      ...Array(Math.max(0, missing)).fill("0"),
      ...tailParts
    ];
    const bytes = Buffer.alloc(16);

    expanded.slice(0, 8).forEach((segment, index) => {
      const value = Number.parseInt(segment, 16);
      bytes[index * 2] = (value >> 8) & 0xff;
      bytes[index * 2 + 1] = value & 0xff;
    });

    return bytes;
  }

  private async getTorSession(
    workspaceId: string
  ): Promise<TorSessionDescriptor> {
    if (!this.getTorSessionResolver) {
      return {
        workspaceId,
        torSocksPort: 9050
      };
    }

    const session = await this.getTorSessionResolver(workspaceId);
    if (!session) {
      throw new AppError("Private Mode is not active for this workspace.", 404, {
        workspaceId
      });
    }

    return session;
  }

  private applyEnvironmentOverrides(proxyUrl: string): void {
    if (this.originalEnv.size === 0) {
      for (const key of [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy"
      ]) {
        this.originalEnv.set(key, process.env[key]);
      }
    }

    const noProxy = DEFAULT_NO_PROXY_PATTERNS.join(",");
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.ALL_PROXY = proxyUrl;
    process.env.http_proxy = proxyUrl;
    process.env.https_proxy = proxyUrl;
    process.env.all_proxy = proxyUrl;
    process.env.NO_PROXY = noProxy;
    process.env.no_proxy = noProxy;
  }

  private async applyOperatingSystemBrowserProxy(proxyUrl: string): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    if (this.originalSystemBrowserProxyState === undefined) {
      this.originalSystemBrowserProxyState = await this.readSystemBrowserProxyState();
    }

    await this.writeSystemBrowserProxyState({
      enabled: true,
      server: this.toWindowsProxyServer(proxyUrl),
      override: "localhost;127.*;<local>",
      autoConfigUrl: null,
      autoDetect: false
    });
  }

  private async restoreOperatingSystemBrowserProxy(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    if (this.originalSystemBrowserProxyState === undefined) {
      return;
    }

    const stateToRestore =
      this.originalSystemBrowserProxyState ?? {
        enabled: false,
        server: null,
        override: null,
        autoConfigUrl: null,
        autoDetect: false
      };
    this.originalSystemBrowserProxyState = undefined;
    await this.writeSystemBrowserProxyState(stateToRestore);
  }

  private restoreEnvironmentOverrides(): void {
    if (this.originalEnv.size === 0) {
      for (const key of [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy"
      ]) {
        delete process.env[key];
      }
      return;
    }

    for (const [key, value] of this.originalEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }

  private async readSystemBrowserProxyState(): Promise<SystemBrowserProxyState | null> {
    if (this.readSystemBrowserProxyStateImpl) {
      return this.readSystemBrowserProxyStateImpl();
    }

    if (this.platform !== "win32") {
      return null;
    }

    const { stdout } = await this.runPowerShell(
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; " +
        "$props = Get-ItemProperty -Path $path; " +
        "[pscustomobject]@{ " +
        "enabled = [bool]($props.ProxyEnable -eq 1); " +
        "server = if ($null -ne $props.ProxyServer -and [string]$props.ProxyServer -ne '') { [string]$props.ProxyServer } else { $null }; " +
        "override = if ($null -ne $props.ProxyOverride -and [string]$props.ProxyOverride -ne '') { [string]$props.ProxyOverride } else { $null }; " +
        "autoConfigUrl = if ($null -ne $props.AutoConfigURL -and [string]$props.AutoConfigURL -ne '') { [string]$props.AutoConfigURL } else { $null }; " +
        "autoDetect = [bool]($props.AutoDetect -eq 1) " +
        "} | ConvertTo-Json -Compress"
    );

    return JSON.parse(stdout.trim()) as SystemBrowserProxyState;
  }

  private async writeSystemBrowserProxyState(
    state: SystemBrowserProxyState
  ): Promise<void> {
    if (this.writeSystemBrowserProxyStateImpl) {
      await this.writeSystemBrowserProxyStateImpl(state);
      return;
    }

    if (this.platform !== "win32") {
      return;
    }

    const script = [
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
      `Set-ItemProperty -Path $path -Name ProxyEnable -Type DWord -Value ${state.enabled ? 1 : 0}`,
      `Set-ItemProperty -Path $path -Name AutoDetect -Type DWord -Value ${state.autoDetect ? 1 : 0}`,
      this.buildRegistryWriteStatement("ProxyServer", state.server),
      this.buildRegistryWriteStatement("ProxyOverride", state.override),
      this.buildRegistryWriteStatement("AutoConfigURL", state.autoConfigUrl),
      "if (-not ('WinInet.NativeMethods' -as [type])) { Add-Type -Namespace WinInet -Name NativeMethods -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"wininet.dll\", SetLastError = true)] public static extern bool InternetSetOption(System.IntPtr hInternet, int dwOption, System.IntPtr lpBuffer, int dwBufferLength);' }",
      "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null",
      "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null"
    ].join("; ");

    await this.runPowerShell(script);
  }

  private buildRegistryWriteStatement(name: string, value: string | null): string {
    if (value === null || value.trim() === "") {
      return `Remove-ItemProperty -Path $path -Name ${this.toPowerShellLiteral(name)} -ErrorAction SilentlyContinue`;
    }

    return `Set-ItemProperty -Path $path -Name ${this.toPowerShellLiteral(
      name
    )} -Value ${this.toPowerShellLiteral(value)}`;
  }

  private toWindowsProxyServer(proxyUrl: string): string {
    const parsed = new URL(proxyUrl);
    return `socks=${parsed.hostname}:${parsed.port}`;
  }

  private toPowerShellLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async runPowerShell(script: string): Promise<{
    stdout: string;
    stderr: string;
  }> {
    const result = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  private matchesNoProxy(hostname: string): boolean {
    const patterns = [
      ...DEFAULT_NO_PROXY_PATTERNS,
      ...(process.env.NO_PROXY ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ];

    for (const pattern of patterns) {
      if (pattern === "*") {
        return true;
      }

      const normalizedPattern = this.normalizeHostname(pattern.replace(/:\d+$/, ""));
      if (!normalizedPattern) {
        continue;
      }

      if (hostname === normalizedPattern) {
        return true;
      }

      if (
        normalizedPattern.startsWith(".") &&
        (hostname === normalizedPattern.slice(1) ||
          hostname.endsWith(normalizedPattern))
      ) {
        return true;
      }
    }

    return false;
  }

  private normalizeHostname(hostname: string | undefined): string | null {
    if (!hostname) {
      return null;
    }

    const normalized = hostname
      .trim()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();

    return normalized || null;
  }

  private isPrivateIpv4(address: string): boolean {
    const [a = -1, b = -1] = address
      .split(".")
      .map((segment) => Number(segment));

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  private isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);

    if (mappedIpv4?.[1]) {
      return this.isPrivateIpv4(mappedIpv4[1]);
    }

    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  private requireFetch(): typeof fetch {
    if (!this.originalFetch) {
      throw new AppError("Global fetch is unavailable in this runtime.", 500);
    }

    return this.originalFetch;
  }

  private async fetchConnectionIdentity(
    fetcher: typeof fetch
  ): Promise<ConnectionIdentity | null> {
    const providers = [
      "https://ipapi.co/json/",
      "https://api64.ipify.org?format=json"
    ];

    for (const provider of providers) {
      try {
        const response = await fetcher(provider, {
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as
          | IpApiIdentityResponse
          | IpAddressResponse;
        const identity = this.parseConnectionIdentity(payload);
        if (identity.ip) {
          return identity;
        }
      } catch (error) {
        this.logger?.debug(
          {
            error,
            provider
          },
          "Public identity lookup failed"
        );
      }
    }

    return null;
  }

  private async fetchTorStatus(fetcher: typeof fetch): Promise<{
    ip: string | null;
    isTor: boolean | null;
  }> {
    const response = await fetcher("https://check.torproject.org/api/ip", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return {
        ip: null,
        isTor: null
      };
    }

    const payload = (await response.json()) as TorStatusResponse;
    return {
      ip: payload.IP ?? null,
      isTor: payload.IsTor ?? null
    };
  }

  private parseConnectionIdentity(
    payload: IpApiIdentityResponse | IpAddressResponse
  ): ConnectionIdentity {
    const ip = payload.ip ?? null;
    return {
      ip,
      city: "city" in payload ? payload.city ?? null : null,
      region:
        "region" in payload
          ? payload.region ?? payload.region_code ?? null
          : null,
      country: "country_name" in payload ? payload.country_name ?? null : null,
      countryCode: "country_code" in payload ? payload.country_code ?? null : null,
      timezone: "timezone" in payload ? payload.timezone ?? null : null,
      organization: "org" in payload ? payload.org ?? null : null,
      asn: "asn" in payload ? payload.asn ?? null : null,
      network: this.detectNetwork(
        "version" in payload ? payload.version : undefined,
        ip
      ),
      isTorExit: null
    };
  }

  private detectNetwork(
    version?: string,
    ip?: string | null
  ): ConnectionIdentity["network"] {
    const normalizedVersion = version?.toLowerCase().trim();
    if (normalizedVersion === "ipv4") {
      return "ipv4";
    }

    if (normalizedVersion === "ipv6") {
      return "ipv6";
    }

    if (!ip) {
      return "unknown";
    }

    if (ip.includes(".")) {
      return "ipv4";
    }

    if (ip.includes(":")) {
      return "ipv6";
    }

    return "unknown";
  }
}
