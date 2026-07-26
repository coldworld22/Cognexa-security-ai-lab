import * as http from "http";
import * as net from "net";
import { Duplex } from "stream";

import { Logger } from "pino";

const SOCKS_VERSION = 0x05;
const SOCKS_AUTH_NONE = 0x00;
const SOCKS_ATYP_IPV4 = 0x01;
const SOCKS_ATYP_DOMAIN = 0x03;
const SOCKS_ATYP_IPV6 = 0x04;

export interface TorHttpProxyBridgeState {
  torSocksPort: number;
  listenPort: number;
  startedAt: string;
}

export interface TorHttpProxyBridgeServiceOptions {
  logger?: Logger;
  now?: () => Date;
  listenHost?: string;
}

export class TorHttpProxyBridgeService {
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly listenHost: string;

  private server: http.Server | null = null;
  private state: TorHttpProxyBridgeState | null = null;

  constructor(options: TorHttpProxyBridgeServiceOptions = {}) {
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.listenHost = options.listenHost ?? "127.0.0.1";
  }

  getState(): TorHttpProxyBridgeState | null {
    return this.state;
  }

  async start(config: {
    torSocksPort: number;
    preferredPort?: number;
  }): Promise<TorHttpProxyBridgeState> {
    if (
      this.state &&
      this.state.torSocksPort === config.torSocksPort &&
      this.server
    ) {
      return this.state;
    }

    await this.stop();

    const server = http.createServer((request, response) => {
      void this.handleHttpRequest(config.torSocksPort, request, response);
    });
    server.on("connect", (request, clientSocket, head) => {
      void this.handleConnectTunnel(
        config.torSocksPort,
        request,
        clientSocket,
        head
      );
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(
        config.preferredPort ?? 0,
        this.listenHost,
        () => resolve()
      );
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The local Tor HTTP proxy bridge did not expose a TCP port.");
    }

    this.server = server;
    this.state = {
      torSocksPort: config.torSocksPort,
      listenPort: address.port,
      startedAt: this.now().toISOString()
    };

    this.logger?.info(
      {
        torSocksPort: config.torSocksPort,
        listenPort: address.port
      },
      "Started the loopback HTTP proxy bridge for Private Mode"
    );

    return this.state;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.state = null;

    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async handleHttpRequest(
    torSocksPort: number,
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    const target = this.resolveHttpTarget(request);
    if (!target) {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("Bad proxy request");
      return;
    }

    try {
      const targetPort =
        target.port.length > 0 ? Number.parseInt(target.port, 10) : 80;
      const { SocksProxyAgent } = await import("socks-proxy-agent");
      const proxyAgent = new SocksProxyAgent(
        `socks5h://127.0.0.1:${torSocksPort}`
      );
      let cleanedUp = false;
      const cleanup = (error?: Error) => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        proxyAgent.destroy();
      };
      const upstreamRequest = http.request({
        host: target.hostname,
        port: targetPort,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: this.sanitizeProxyHeaders(request.headers),
        agent: proxyAgent
      });

      upstreamRequest.once("response", (upstreamResponse) => {
        upstreamResponse.once("end", () => {
          cleanup();
        });
        upstreamResponse.once("error", (error) => {
          cleanup(error);
        });
        response.once("close", () => {
          cleanup();
        });

        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.statusMessage,
          upstreamResponse.headers
        );
        upstreamResponse.pipe(response);
      });

      upstreamRequest.once("error", (error) => {
        cleanup(error);
        if (!response.headersSent) {
          response.writeHead(502, { "Content-Type": "text/plain" });
        }
        response.end("Failed to reach the upstream origin through Tor.");
      });

      request.once("aborted", () => {
        upstreamRequest.destroy(new Error("The client aborted the proxied request."));
        cleanup();
      });

      request.pipe(upstreamRequest);
    } catch (error) {
      this.logger?.warn(
        {
          error,
          target: request.url
        },
        "HTTP proxy bridge request failed"
      );
      response.writeHead(502, { "Content-Type": "text/plain" });
      response.end("Failed to open the Tor tunnel.");
    }
  }

  private async handleConnectTunnel(
    torSocksPort: number,
    request: http.IncomingMessage,
    clientSocket: Duplex,
    head: Buffer
  ): Promise<void> {
    try {
      const target = this.parseAuthority(request.url);
      const upstreamSocket = await this.openSocksTunnel(
        torSocksPort,
        target.host,
        target.port
      );

      clientSocket.write(
        "HTTP/1.1 200 Connection Established\r\nProxy-Agent: SecurityAiLab\r\n\r\n"
      );
      if (head.length > 0) {
        upstreamSocket.write(head);
      }

      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);

      const destroyPeer = (socket: Duplex) => (error?: Error) => {
        if (error) {
          socket.destroy(error);
          return;
        }

        socket.destroy();
      };

      upstreamSocket.once("error", destroyPeer(clientSocket));
      clientSocket.once("error", destroyPeer(upstreamSocket));
      upstreamSocket.once("close", destroyPeer(clientSocket));
      clientSocket.once("close", destroyPeer(upstreamSocket));
    } catch (error) {
      this.logger?.warn(
        {
          error,
          target: request.url
        },
        "HTTP CONNECT proxy bridge request failed"
      );
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  }

  private resolveHttpTarget(request: http.IncomingMessage): URL | null {
    const rawUrl = request.url?.trim();
    if (!rawUrl) {
      return null;
    }

    try {
      return new URL(rawUrl);
    } catch {
      const host = request.headers.host?.trim();
      if (!host) {
        return null;
      }

      return new URL(`http://${host}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`);
    }
  }

  private parseAuthority(authority: string | undefined): {
    host: string;
    port: number;
  } {
    if (!authority) {
      throw new Error("Missing CONNECT authority.");
    }

    if (authority.startsWith("[")) {
      const closingBracket = authority.indexOf("]");
      const host = authority.slice(1, closingBracket);
      const port = Number.parseInt(authority.slice(closingBracket + 2), 10);
      return {
        host,
        port: Number.isFinite(port) ? port : 443
      };
    }

    const lastColon = authority.lastIndexOf(":");
    if (lastColon === -1) {
      return {
        host: authority,
        port: 443
      };
    }

    const host = authority.slice(0, lastColon);
    const port = Number.parseInt(authority.slice(lastColon + 1), 10);
    return {
      host,
      port: Number.isFinite(port) ? port : 443
    };
  }

  private sanitizeProxyHeaders(
    headers: http.IncomingHttpHeaders
  ): http.OutgoingHttpHeaders {
    const sanitized: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
      if (
        name.toLowerCase() === "proxy-connection" ||
        name.toLowerCase() === "proxy-authorization"
      ) {
        continue;
      }

      sanitized[name] = value;
    }

    return sanitized;
  }

  private async openSocksTunnel(
    torSocksPort: number,
    host: string,
    port: number
  ): Promise<net.Socket> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const target = net.connect({
        host: "127.0.0.1",
        port: torSocksPort,
        family: 4
      });
      let settled = false;
      let stage: "greeting" | "connect" = "greeting";
      let buffer = Buffer.alloc(0);

      const cleanup = () => {
        target.removeListener("connect", handleConnect);
        target.removeListener("data", handleData);
        target.removeListener("error", handleError);
      };

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback();
      };

      const handleError = (error: Error) => {
        finish(() => {
          target.destroy();
          reject(error);
        });
      };

      const handleConnect = () => {
        target.write(Buffer.from([SOCKS_VERSION, 0x01, SOCKS_AUTH_NONE]));
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
              handleError(new Error("The Tor SOCKS proxy rejected the greeting."));
              return;
            }

            target.write(this.buildSocksConnectRequest(host, port));
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
            handleError(new Error("The Tor SOCKS proxy rejected the CONNECT request."));
            return;
          }

          finish(() => {
            if (buffer.length > 0) {
              target.unshift(buffer);
            }
            resolve(target);
          });
          return;
        }
      };

      target.once("connect", handleConnect);
      target.on("data", handleData);
      target.once("error", handleError);
    });

    return socket;
  }

  private buildSocksConnectRequest(host: string, port: number): Buffer {
    const hostname = host.trim();
    const portBuffer = Buffer.allocUnsafe(2);
    portBuffer.writeUInt16BE(port, 0);

    if (net.isIPv4(hostname)) {
      const octets = hostname.split(".").map((segment) => Number.parseInt(segment, 10));
      return Buffer.from([
        SOCKS_VERSION,
        0x01,
        0x00,
        SOCKS_ATYP_IPV4,
        octets[0] ?? 0,
        octets[1] ?? 0,
        octets[2] ?? 0,
        octets[3] ?? 0,
        ...portBuffer
      ]);
    }

    if (net.isIPv6(hostname)) {
      const normalized = this.expandIpv6(hostname);
      return Buffer.concat([
        Buffer.from([SOCKS_VERSION, 0x01, 0x00, SOCKS_ATYP_IPV6]),
        normalized,
        portBuffer
      ]);
    }

    const hostnameBuffer = Buffer.from(hostname, "utf8");
    return Buffer.concat([
      Buffer.from([
        SOCKS_VERSION,
        0x01,
        0x00,
        SOCKS_ATYP_DOMAIN,
        hostnameBuffer.length
      ]),
      hostnameBuffer,
      portBuffer
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

    if (atyp === SOCKS_ATYP_DOMAIN) {
      const domainLength = buffer[4];
      return domainLength === undefined ? null : 5 + domainLength + 2;
    }

    if (atyp === SOCKS_ATYP_IPV6) {
      return 22;
    }

    return null;
  }

  private expandIpv6(input: string): Buffer {
    const [left, right] = input.split("::");
    const leftParts = left ? left.split(":").filter(Boolean) : [];
    const rightParts = right ? right.split(":").filter(Boolean) : [];
    const missingParts = 8 - (leftParts.length + rightParts.length);
    const full = [
      ...leftParts,
      ...new Array(Math.max(0, missingParts)).fill("0"),
      ...rightParts
    ];
    const buffer = Buffer.alloc(16);

    for (let index = 0; index < 8; index += 1) {
      const part = Number.parseInt(full[index] ?? "0", 16);
      buffer.writeUInt16BE(part, index * 2);
    }

    return buffer;
  }
}
