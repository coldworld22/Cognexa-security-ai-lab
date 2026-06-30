import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { lookup, resolveTxt } from "dns/promises";
import { Agent as HttpAgent } from "http";
import { Socket } from "net";

import { Logger } from "pino";

import { toCloakingConfig } from "../../database/entities/private-mode-config.entity";
import { PrivateModeConfigRepository } from "../../database/repositories/private-mode-config.repository";
import { PrivateModeExitLogRepository } from "../../database/repositories/private-mode-exit-log.repository";
import { PrivateModeSessionRepository } from "../../database/repositories/private-mode-session.repository";
import { AppError } from "../../utils/app-error";
import { PolicyCategory } from "../../policy/policy.types";
import {
  CircuitStatus,
  ConnectionIdentity,
  CloakingConfig,
  CloakingSession,
  CloakingVerificationResult,
  DNSResolver,
  DnsLookupResult,
  ExitLog,
  LeakTestResult,
  PRIVATE_MODE_OUTBOUND_STRATEGIES,
  PrivateModeOutboundStrategy,
  RelayNode
} from "./private-mode.types";

const CURL_EXECUTABLE = process.platform === "win32" ? "curl.exe" : "curl";
const CURL_META_MARKER = "__COGNEXA_CLOAKING_META__";
const SENSITIVE_TOR_CATEGORIES = new Set<PolicyCategory>([
  "security_research",
  "vulnerability_analysis"
]);
const DEFAULT_ENABLED_CATEGORIES: PolicyCategory[] = [
  "security_research",
  "vulnerability_analysis",
  "external_url_access"
];

interface CloakingServiceOptions {
  now?: () => Date;
  directFetch?: typeof fetch;
  lookupHost?: typeof lookup;
  resolveTxtImpl?: typeof resolveTxt;
}

interface DnsAnswer {
  data?: string;
  type?: number;
}

interface DnsJsonResponse {
  Answer?: DnsAnswer[];
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

export class CloakingService {
  private readonly now: () => Date;
  private readonly directFetch: typeof fetch;
  private readonly lookupHost: typeof lookup;
  private readonly resolveTxtImpl: typeof resolveTxt;

  constructor(
    private readonly configs: PrivateModeConfigRepository,
    private readonly sessions: PrivateModeSessionRepository,
    private readonly exitLogs: PrivateModeExitLogRepository,
    private readonly logger: Logger,
    options: CloakingServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.directFetch = options.directFetch ?? fetch;
    this.lookupHost = options.lookupHost ?? lookup;
    this.resolveTxtImpl = options.resolveTxtImpl ?? resolveTxt;
  }

  async activatePrivateMode(
    workspaceId: string,
    config: CloakingConfig
  ): Promise<CloakingSession> {
    const now = this.now().toISOString();
    const nextConfig = await this.persistConfig({
      ...this.defaultConfig(workspaceId),
      ...config,
      workspaceId,
      mode: "cloaked"
    });

    const existing = await this.sessions.findActiveByWorkspaceId(workspaceId);
    if (existing) {
      await this.sessions.endSession(existing.id, now);
    }

    const initialCircuitId = this.buildCircuitId(nextConfig.outboundStrategy);
    const session = await this.sessions.create({
      workspaceId,
      strategy: nextConfig.outboundStrategy,
      exitNodes: this.initialExitNodes(nextConfig),
      circuitIds: [initialCircuitId],
      startedAt: now
    });

    const exitIdentity = await this.determineExitIdentity(
      workspaceId,
      this.getVerificationCategory(nextConfig)
    ).catch((error) => {
      this.logger.warn(
        { error, workspaceId },
        "Private mode activation completed without exit verification"
      );
      return null;
    });

    if (exitIdentity?.ip) {
      const hydrated = await this.sessions.updateRuntime(session.id, {
        exitNodes: [exitIdentity.ip],
        circuitIds: session.circuitIds
      });
      return this.toSession(hydrated);
    }

    return this.toSession(session);
  }

  async deactivatePrivateMode(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new AppError("Private mode session not found.", 404);
    }

    await this.sessions.endSession(sessionId, this.now().toISOString());
    const current = await this.getConfig(session.workspaceId);
    await this.persistConfig({
      ...current,
      mode: "direct"
    });
  }

  async getActiveSession(workspaceId: string): Promise<CloakingSession | null> {
    const session = await this.sessions.findActiveByWorkspaceId(workspaceId);
    return session ? this.toSession(session) : null;
  }

  getOutboundAgent(): HttpAgent {
    return new HttpAgent({
      keepAlive: true
    });
  }

  getDNSResolver(
    workspaceId?: string,
    category: PolicyCategory = "external_url_access"
  ): DNSResolver {
    return {
      lookupHost: async (hostname, options) =>
        workspaceId
          ? this.lookupForWorkspace(workspaceId, category, hostname, options)
          : this.lookupDirect(hostname, options),
      resolveTxt: async (hostname) =>
        workspaceId
          ? this.resolveTxtForWorkspace(workspaceId, category, hostname)
          : this.resolveTxtImpl(hostname)
    };
  }

  async verifyCloaking(
    workspaceId: string
  ): Promise<CloakingVerificationResult> {
    const leakTest = await this.runLeakTest(workspaceId);
    return {
      exitIp: leakTest.exitIp,
      isCloaked: leakTest.leaks.length === 0 && Boolean(leakTest.exitIp),
      leaks: leakTest.leaks,
      directIdentity: leakTest.directIdentity,
      exitIdentity: leakTest.exitIdentity,
      dnsTransport: leakTest.dnsTransport,
      verificationCategory: leakTest.verificationCategory,
      transportVerified: leakTest.transportVerified,
      advisories: leakTest.advisories
    };
  }

  async runLeakTest(workspaceId: string): Promise<LeakTestResult> {
    const config = await this.getConfig(workspaceId);
    const activeSession = await this.sessions.findActiveByWorkspaceId(workspaceId);
    const testedAt = this.now().toISOString();
    const verificationCategory = this.getVerificationCategory(config);
    const directIdentity = await this.determineExitIdentityDirect().catch(() => null);
    const routedIdentity =
      config.mode === "cloaked" && activeSession
        ? await this.determineExitIdentity(workspaceId, verificationCategory).catch(
            () => null
          )
        : directIdentity;
    const leaks: string[] = [];
    const torTransportExpected = this.usesTorTransport(config, verificationCategory);

    if (!activeSession || config.mode !== "cloaked") {
      leaks.push("private_mode_inactive");
    }

    if (!routedIdentity?.ip) {
      leaks.push("exit_ip_unavailable");
    }

    if (
      activeSession &&
      config.mode === "cloaked" &&
      torTransportExpected &&
      routedIdentity?.isTorExit !== true
    ) {
      leaks.push("tor_exit_unconfirmed");
    }

    if (
      activeSession &&
      config.mode === "cloaked" &&
      directIdentity?.ip &&
      routedIdentity?.ip &&
      directIdentity.ip === routedIdentity.ip &&
      torTransportExpected
    ) {
      leaks.push("exit_ip_matches_direct_path");
    }

    if (
      config.mode === "cloaked" &&
      config.dnsOverTor &&
      !torTransportExpected
    ) {
      leaks.push("dns_over_tor_requested_without_tor_transport");
    }

    return {
      testedAt,
      strategy:
        config.mode === "cloaked" && activeSession ? activeSession.strategy : "direct",
      directIp: directIdentity?.ip ?? null,
      exitIp: routedIdentity?.ip ?? null,
      exitRegion: routedIdentity?.country ?? routedIdentity?.region ?? null,
      dnsTransport:
        config.mode === "cloaked" && config.dnsOverTor && torTransportExpected
          ? "tor"
          : "local",
      isTorExit: routedIdentity?.isTorExit ?? null,
      leaks,
      directIdentity,
      exitIdentity: routedIdentity,
      verificationCategory,
      transportVerified: this.isTransportVerified(
        config,
        verificationCategory,
        routedIdentity
      ),
      advisories: this.buildVerificationAdvisories(config, verificationCategory)
    };
  }

  async rotateCircuit(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new AppError("Private mode session not found.", 404);
    }

    if (session.endedAt) {
      throw new AppError("Private mode session is no longer active.", 400);
    }

    const config = await this.getConfig(session.workspaceId);
    const nextCircuitId = this.buildCircuitId(session.strategy);

    if (this.usesTorTransport(config, this.getVerificationCategory(config))) {
      await this.signalNewnym(config);
    }

    const nextExitIdentity = await this.determineExitIdentity(
      session.workspaceId,
      this.getVerificationCategory(config)
    ).catch(() => null);

    await this.sessions.updateRuntime(sessionId, {
      circuitIds: [...session.circuitIds, nextCircuitId].slice(-8),
      exitNodes: nextExitIdentity?.ip ? [nextExitIdentity.ip] : session.exitNodes
    });
  }

  async getCircuitStatus(sessionId: string): Promise<CircuitStatus> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new AppError("Private mode session not found.", 404);
    }

    return {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      strategy: session.strategy,
      active: !session.endedAt,
      exitNodes: session.exitNodes,
      circuitIds: session.circuitIds,
      lastRotatedAt: session.updatedAt
    };
  }

  async updateConfig(
    workspaceId: string,
    config: Partial<CloakingConfig>
  ): Promise<CloakingConfig> {
    const current = await this.getConfig(workspaceId);
    return this.persistConfig({
      ...current,
      ...config,
      workspaceId,
      vpnRelays: config.vpnRelays ?? current.vpnRelays,
      exitGeographyPreference:
        config.exitGeographyPreference ?? current.exitGeographyPreference,
      enabledCategories: config.enabledCategories ?? current.enabledCategories
    });
  }

  async getConfig(workspaceId: string): Promise<CloakingConfig> {
    const existing = await this.configs.findByWorkspaceId(workspaceId);
    return existing ? toCloakingConfig(existing) : this.defaultConfig(workspaceId);
  }

  async listExitLogs(workspaceId: string, limit = 50): Promise<ExitLog[]> {
    const logs = await this.exitLogs.listByWorkspace(workspaceId, limit);
    return logs.map((log) => ({
      id: log.id,
      sessionId: log.sessionId,
      workspaceId: log.workspaceId,
      exitIp: log.exitIp,
      exitRegion: log.exitRegion,
      targetHost: log.targetHost,
      requestType: log.requestType,
      timestamp: log.timestamp,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt
    }));
  }

  async fetchForWorkspace(
    workspaceId: string,
    category: PolicyCategory,
    input: string | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const config = await this.getConfig(workspaceId);
    const session = await this.sessions.findActiveByWorkspaceId(workspaceId);
    const target = new URL(String(input));

    if (!session || !this.shouldCloak(config, category)) {
      return this.directFetch(input, init);
    }

    await this.applyJitter(config);

    const response = this.usesTorTransport(config, category)
      ? await this.fetchViaTor(config, input, init)
      : await this.directFetch(input, init);

    await this.recordExitLog(session.id, workspaceId, target, init.method ?? "GET");

    return response;
  }

  async lookupForWorkspace(
    workspaceId: string,
    category: PolicyCategory,
    hostname: string,
    options?: {
      all?: boolean;
      verbatim?: boolean;
    }
  ): Promise<DnsLookupResult[]> {
    const config = await this.getConfig(workspaceId);
    const session = await this.sessions.findActiveByWorkspaceId(workspaceId);

    if (
      !session ||
      !this.shouldCloak(config, category) ||
      !config.dnsOverTor ||
      !this.usesTorTransport(config, category)
    ) {
      return this.lookupDirect(hostname, options);
    }

    const [a, aaaa] = await Promise.all([
      this.resolveDohRecords(workspaceId, hostname, "A"),
      this.resolveDohRecords(workspaceId, hostname, "AAAA")
    ]);

    const addresses = [
      ...a.map((address) => ({ address, family: 4 })),
      ...aaaa.map((address) => ({ address, family: 6 }))
    ];

    if (!addresses.length) {
      throw new AppError("Unable to resolve hostname through cloaked DNS.", 400, {
        hostname
      });
    }

    return addresses;
  }

  async resolveTxtForWorkspace(
    workspaceId: string,
    category: PolicyCategory,
    hostname: string
  ): Promise<string[][]> {
    const config = await this.getConfig(workspaceId);
    const session = await this.sessions.findActiveByWorkspaceId(workspaceId);

    if (
      !session ||
      !this.shouldCloak(config, category) ||
      !config.dnsOverTor ||
      !this.usesTorTransport(config, category)
    ) {
      return this.resolveTxtImpl(hostname);
    }

    const records = await this.resolveDohRecords(workspaceId, hostname, "TXT");
    return records.map((record) => [record]);
  }

  private async persistConfig(config: CloakingConfig): Promise<CloakingConfig> {
    const now = this.now().toISOString();
    const entity = await this.configs.upsert({
      id: config.workspaceId,
      workspaceId: config.workspaceId,
      mode: config.mode,
      outboundStrategy: config.outboundStrategy,
      vpnRelays: this.normalizeRelayNodes(config.vpnRelays),
      torControlPort: config.torControlPort,
      torSocksPort: config.torSocksPort,
      dnsOverTor: config.dnsOverTor,
      exitGeographyPreference: config.exitGeographyPreference,
      circuitRotationInterval: config.circuitRotationInterval,
      tlsFingerprintProfile: config.tlsFingerprintProfile,
      requestTimingJitter: config.requestTimingJitter,
      enabledCategories: config.enabledCategories,
      createdAt: config.createdAt ?? now,
      updatedAt: now
    });

    return toCloakingConfig(entity);
  }

  private defaultConfig(workspaceId: string): CloakingConfig {
    return {
      workspaceId,
      mode: "direct",
      outboundStrategy: PRIVATE_MODE_OUTBOUND_STRATEGIES[0],
      vpnRelays: [],
      torControlPort: 9051,
      torSocksPort: 9050,
      dnsOverTor: true,
      exitGeographyPreference: [],
      circuitRotationInterval: 900,
      tlsFingerprintProfile: "browser",
      requestTimingJitter: 250,
      enabledCategories: DEFAULT_ENABLED_CATEGORIES
    };
  }

  private normalizeRelayNodes(relays: RelayNode[]): RelayNode[] {
    return relays.map((relay) => ({
      ...relay,
      lastCheckedAt: relay.lastCheckedAt
    }));
  }

  private getVerificationCategory(config: CloakingConfig): PolicyCategory {
    const preferredOrder =
      config.outboundStrategy === "hybrid"
        ? ([
            "security_research",
            "vulnerability_analysis",
            "external_url_access"
          ] satisfies PolicyCategory[])
        : ([
            "external_url_access",
            "security_research",
            "vulnerability_analysis"
          ] satisfies PolicyCategory[]);

    return (
      preferredOrder.find((category) => config.enabledCategories.includes(category)) ??
      "external_url_access"
    );
  }

  private buildVerificationAdvisories(
    config: CloakingConfig,
    verificationCategory: PolicyCategory
  ): string[] {
    const advisories: string[] = [];

    if (config.outboundStrategy === "vpn-chain") {
      advisories.push("vpn_chain_external_tunnel_required");
    }

    if (config.outboundStrategy === "hybrid") {
      advisories.push("hybrid_sensitive_categories_only");

      if (verificationCategory === "external_url_access") {
        advisories.push("hybrid_sensitive_categories_disabled");
      }
    }

    if (config.outboundStrategy === "rotating-proxy") {
      advisories.push("rotating_proxy_uses_tor_transport");
    }

    return advisories;
  }

  private isTransportVerified(
    config: CloakingConfig,
    verificationCategory: PolicyCategory,
    identity: ConnectionIdentity | null
  ): boolean {
    if (config.mode !== "cloaked" || !this.usesTorTransport(config, verificationCategory)) {
      return false;
    }

    return identity?.isTorExit === true;
  }

  private shouldCloak(config: CloakingConfig, category: PolicyCategory): boolean {
    return (
      config.mode === "cloaked" &&
      config.enabledCategories.includes(category)
    );
  }

  private usesTorTransport(
    config: CloakingConfig,
    category: PolicyCategory
  ): boolean {
    if (config.outboundStrategy === "tor" || config.outboundStrategy === "rotating-proxy") {
      return true;
    }

    if (config.outboundStrategy === "hybrid") {
      return SENSITIVE_TOR_CATEGORIES.has(category);
    }

    return false;
  }

  private async applyJitter(config: CloakingConfig): Promise<void> {
    if (config.requestTimingJitter <= 0) {
      return;
    }

    const duration = Math.floor(Math.random() * config.requestTimingJitter);
    if (duration <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, duration));
  }

  private async fetchViaTor(
    config: CloakingConfig,
    input: string | URL,
    init: RequestInit
  ): Promise<Response> {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const method = (init.method ?? "GET").toUpperCase();
    const args = [
      "--silent",
      "--show-error",
      "--include",
      "--proxy",
      `socks5h://127.0.0.1:${config.torSocksPort}`,
      "--request",
      method,
      "--max-time",
      "30",
      "--connect-timeout",
      "15"
    ];

    if (init.redirect !== "manual") {
      args.push("--location", "--max-redirs", "5");
    }

    this.applyFingerprintHeaders(headers, config);

    headers.forEach((value, key) => {
      args.push("--header", `${key}: ${value}`);
    });

    if (typeof init.body === "string" && init.body.length > 0) {
      args.push("--data-binary", init.body);
    }

    args.push(
      "--write-out",
      `${CURL_META_MARKER}%{http_code}|%{url_effective}`,
      url.toString()
    );

    const stdout = await this.execCurl(args, init.signal ?? undefined);
    return this.parseCurlResponse(stdout, url);
  }

  private applyFingerprintHeaders(
    headers: Headers,
    config: CloakingConfig
  ): void {
    if (headers.has("User-Agent")) {
      return;
    }

    switch (config.tlsFingerprintProfile) {
      case "curl":
        headers.set("User-Agent", "curl/8.7.1");
        break;
      case "random": {
        const userAgents = [
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
        ];
        headers.set(
          "User-Agent",
          userAgents[Math.floor(Math.random() * userAgents.length)] ??
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        );
        break;
      }
      case "browser":
      default:
        headers.set(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        );
        break;
    }
  }

  private async execCurl(args: string[], signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = execFile(CURL_EXECUTABLE, args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 6
      });

      if (signal) {
        if (signal.aborted) {
          child.kill();
          reject(new AppError("Cloaked request was aborted.", 499));
          return;
        }

        const abortHandler = () => child.kill();
        signal.addEventListener("abort", abortHandler, { once: true });
        child.once("close", () => {
          signal.removeEventListener("abort", abortHandler);
        });
      }

      child.once("error", (error) => {
        reject(
          new AppError("Failed to execute a cloaked outbound request.", 502, {
            reason: error.message
          })
        );
      });

      child.once("close", (code) => {
        if (code !== 0) {
          reject(
            new AppError("Failed to execute a cloaked outbound request.", 502, {
              reason: `curl exited with code ${code ?? "unknown"}`
            })
          );
        }
      });

      child.once("spawn", () => {
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("exit", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }

        reject(
          new AppError("Failed to execute a cloaked outbound request.", 502, {
            reason: stderr || `curl exited with code ${code ?? "unknown"}`
          })
        );
      });
    });
  }

  private parseCurlResponse(stdout: string, requestedUrl: URL): Response {
    const markerIndex = stdout.lastIndexOf(CURL_META_MARKER);
    if (markerIndex === -1) {
      throw new AppError("Failed to parse cloaked response metadata.", 502);
    }

    const rawPayload = stdout.slice(0, markerIndex);
    const meta = stdout.slice(markerIndex + CURL_META_MARKER.length).trim();
    const [statusRaw, effectiveUrlRaw] = meta.split("|");
    const status = Number(statusRaw);
    const effectiveUrl = effectiveUrlRaw?.trim() || requestedUrl.toString();

    const { headers, body } = this.extractHeadersAndBody(rawPayload);
    const response = new Response(body, {
      status: Number.isFinite(status) && status > 0 ? status : 200,
      headers
    });

    Object.defineProperty(response, "url", {
      configurable: true,
      value: effectiveUrl
    });

    return response;
  }

  private extractHeadersAndBody(payload: string): {
    headers: Headers;
    body: string;
  } {
    let cursor = 0;
    let headers = new Headers();
    let foundHeaders = false;
    while (
      payload.startsWith("HTTP/", cursor) ||
      payload.startsWith("HTTP/2", cursor)
    ) {
      const endOfBlock = payload.indexOf("\r\n\r\n", cursor);
      const separatorLength = endOfBlock >= 0 ? 4 : 0;
      const normalizedEnd =
        endOfBlock >= 0 ? endOfBlock : payload.indexOf("\n\n", cursor);
      if (normalizedEnd < 0) {
        break;
      }

      const block = payload.slice(cursor, normalizedEnd);
      const lines = block.split(/\r?\n/);
      headers = new Headers();
      for (const line of lines.slice(1)) {
        const separator = line.indexOf(":");
        if (separator <= 0) {
          continue;
        }
        headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
      cursor = normalizedEnd + (separatorLength || 2);
      foundHeaders = true;

      if (!payload.startsWith("HTTP/", cursor) && !payload.startsWith("HTTP/2", cursor)) {
        break;
      }
    }

    return {
      headers,
      body: foundHeaders ? payload.slice(cursor) : payload
    };
  }

  private async lookupDirect(
    hostname: string,
    options?: {
      all?: boolean;
      verbatim?: boolean;
    }
  ): Promise<DnsLookupResult[]> {
    const result = await this.lookupHost(hostname, {
      all: true,
      verbatim: options?.verbatim ?? true
    });

    const addresses = Array.isArray(result) ? result : [result];
    return addresses.map((address) => ({
      address: address.address,
      family: address.family
    }));
  }

  private async resolveDohRecords(
    workspaceId: string,
    hostname: string,
    type: "A" | "AAAA" | "TXT"
  ): Promise<string[]> {
    const response = await this.fetchForWorkspace(
      workspaceId,
      "external_url_access",
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      {
        headers: {
          Accept: "application/dns-json"
        }
      }
    );

    if (!response.ok) {
      throw new AppError("Cloaked DNS resolution failed.", 502, {
        hostname,
        type,
        statusCode: response.status
      });
    }

    const body = (await response.json()) as DnsJsonResponse;
    return (body.Answer ?? [])
      .map((answer) => answer.data ?? "")
      .filter(Boolean)
      .map((record) => record.replace(/^"|"$/g, "").replace(/\\"/g, "\""));
  }

  private async determineExitIdentity(
    workspaceId: string,
    category: PolicyCategory = "external_url_access"
  ): Promise<ConnectionIdentity> {
    const [identity, torStatus] = await Promise.all([
      this.fetchConnectionIdentity((input, init) =>
        this.fetchForWorkspace(workspaceId, category, input, init)
      ).catch(() => null),
      this.fetchTorStatus((input, init) =>
        this.fetchForWorkspace(workspaceId, category, input, init)
      )
    ]);

    if (!identity && !torStatus.ip) {
      throw new AppError("Unable to determine the cloaked exit identity.", 502);
    }

    return this.applyTorStatus(
      identity ?? this.parseConnectionIdentity({ ip: torStatus.ip ?? undefined }),
      torStatus.ip,
      torStatus.isTor
    );
  }

  private async determineExitIdentityDirect(): Promise<ConnectionIdentity> {
    return this.fetchConnectionIdentity((input, init) =>
      this.directFetch(input, init)
    );
  }

  private async fetchConnectionIdentity(
    fetcher: (input: string, init: RequestInit) => Promise<Response>
  ): Promise<ConnectionIdentity> {
    const providers = [
      "https://ipapi.co/json/",
      "https://api64.ipify.org?format=json"
    ];

    let lastError: unknown = null;

    for (const provider of providers) {
      try {
        const response = await fetcher(provider, {
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new AppError("Connection identity lookup failed.", 502, {
            provider,
            statusCode: response.status
          });
        }

        const identity = this.parseConnectionIdentity(
          (await response.json()) as IpApiIdentityResponse | IpAddressResponse
        );

        if (identity.ip) {
          return identity;
        }

        throw new AppError(
          "Connection identity lookup did not return an IP address.",
          502,
          {
            provider
          }
        );
      } catch (error) {
        lastError = error;
        this.logger.debug(
          {
            error,
            provider
          },
          "Connection identity provider lookup failed"
        );
      }
    }

    throw (
      lastError instanceof AppError
        ? lastError
        : new AppError("Unable to determine public connection identity.", 502)
    );
  }

  private async fetchTorStatus(
    fetcher: (input: string, init: RequestInit) => Promise<Response>
  ): Promise<{
    ip: string | null;
    isTor: boolean | null;
  }> {
    return fetcher("https://check.torproject.org/api/ip", {
      headers: {
        Accept: "application/json"
      }
    }).then(async (torResponse) => {
      if (!torResponse.ok) {
        throw new AppError("Tor exit status lookup failed.", 502, {
          statusCode: torResponse.status
        });
      }

      const tor = (await torResponse.json()) as TorStatusResponse;
      return {
        ip: tor.IP ?? null,
        isTor: tor.IsTor ?? null
      };
    }).catch((error) => {
      this.logger.debug(
        {
          error
        },
        "Tor exit status lookup failed"
      );

      return {
        ip: null,
        isTor: null
      };
    });
  }

  private parseConnectionIdentity(
    identity: IpApiIdentityResponse
  ): ConnectionIdentity {
    const ip = identity.ip ?? null;
    return {
      ip,
      city: identity.city ?? null,
      region: identity.region ?? identity.region_code ?? null,
      country: identity.country_name ?? null,
      countryCode: identity.country_code ?? null,
      timezone: identity.timezone ?? null,
      organization: identity.org ?? null,
      asn: identity.asn ?? null,
      network: this.detectNetwork(identity.version, ip),
      isTorExit: null
    };
  }

  private applyTorStatus(
    identity: ConnectionIdentity,
    fallbackIp: string | null,
    isTorExit: boolean | null
  ): ConnectionIdentity {
    const ip = identity.ip ?? fallbackIp;
    return {
      ...identity,
      ip,
      network: this.detectNetwork(undefined, ip),
      isTorExit
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

  private async recordExitLog(
    sessionId: string,
    workspaceId: string,
    target: URL,
    method: string
  ): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    const exitIp = session?.exitNodes[0] ?? "unknown";
    await this.exitLogs.create({
      sessionId,
      workspaceId,
      exitIp,
      exitRegion: "unknown",
      targetHost: target.hostname,
      requestType: method.toUpperCase(),
      timestamp: this.now().toISOString()
    });
  }

  private initialExitNodes(config: CloakingConfig): string[] {
    if (config.outboundStrategy === "vpn-chain") {
      return config.vpnRelays.map((relay) => relay.region || relay.name).slice(0, 3);
    }

    if (config.outboundStrategy === "hybrid") {
      return ["hybrid-circuit"];
    }

    return ["tor-pending"];
  }

  private buildCircuitId(strategy: PrivateModeOutboundStrategy): string {
    return `${strategy}:${randomUUID()}`;
  }

  private toSession(entity: {
    id: string;
    workspaceId: string;
    strategy: PrivateModeOutboundStrategy;
    exitNodes: string[];
    circuitIds: string[];
    startedAt: string;
    endedAt?: string;
    createdAt?: string;
    updatedAt?: string;
  }): CloakingSession {
    return {
      id: entity.id,
      workspaceId: entity.workspaceId,
      strategy: entity.strategy,
      exitNodes: entity.exitNodes,
      circuitIds: entity.circuitIds,
      startedAt: entity.startedAt,
      endedAt: entity.endedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  private async signalNewnym(config: CloakingConfig): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      let buffer = "";
      let stage: "auth" | "signal" = "auth";
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        callback();
      };

      const fail = (error: unknown) => {
        finish(() => {
          socket.destroy();
          reject(
            error instanceof AppError
              ? error
              : new AppError("Failed to rotate the Tor circuit.", 502, {
                  reason: error instanceof Error ? error.message : "unknown"
                })
          );
        });
      };

      socket.setTimeout(5000);
      socket.once("timeout", () => fail(new Error("Tor control port timeout")));
      socket.once("error", fail);
      socket.connect(config.torControlPort, "127.0.0.1", () => {
        socket.write("AUTHENTICATE\r\n");
      });
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) {
            continue;
          }

          if (line.startsWith("5")) {
            fail(new Error(line));
            return;
          }

          if (!line.startsWith("250")) {
            continue;
          }

          if (stage === "auth") {
            stage = "signal";
            socket.write("SIGNAL NEWNYM\r\n");
            continue;
          }

          finish(() => {
            socket.end("QUIT\r\n");
            resolve();
          });
          return;
        }
      });
    });
  }
}
