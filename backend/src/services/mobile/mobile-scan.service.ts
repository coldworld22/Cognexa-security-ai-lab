import axios, { AxiosResponse } from "axios";
import fs from "fs";
import { unlink } from "fs/promises";
import { Logger } from "pino";
import { v4 as uuidv4 } from "uuid";

import { MobileScanResultEntity } from "../../database/entities/mobile-scan-result.entity";
import { MobileScanResultRepository } from "../../database/repositories/mobile-scan-result.repository";
import { AppError } from "../../utils/app-error";
import { CloakingService } from "../private-mode/cloaking.service";
import {
  MobileAppFileType,
  MobileScanExportFormat,
  MobileScanExportResult,
  MobileScanRequest,
  ParsedReport,
  Permission,
  ScanResult,
  Summary,
  Vulnerability
} from "./mobile-scan.types";

interface PrivateModeStatus {
  active: boolean;
  torPort: number;
}

interface ScanLogEntry {
  timestamp?: string;
  status?: string;
  exception?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MobileScanService {
  private readonly mobsfUrl: string;
  private readonly mobsfApiKey: string;

  constructor(
    private readonly scans: MobileScanResultRepository,
    private readonly privateMode: CloakingService,
    private readonly logger: Logger
  ) {
    this.mobsfUrl = process.env.MOBSF_URL || "http://localhost:8000";
    this.mobsfApiKey = process.env.MOBSF_API_KEY || "";
  }

  /**
   * MAIN SCAN METHOD - Called from API route
   * Must handle: APK, AAB, IPA files
   * Must route through Tor if Private Mode active
   * Must parse MobSF results
   * Must save to database
   */
  async scanApp(params: MobileScanRequest): Promise<ScanResult> {
    const privateMode = await this.getPrivateModeStatus(params.workspaceId);

    try {
      const upload = await this.uploadToMobSF(
        params.filePath,
        params.fileName,
        privateMode
      );
      const hash = asString(upload.hash || upload.md5).trim();

      if (!hash) {
        throw new AppError("MobSF upload completed without returning a scan hash.", 502, {
          response: upload
        });
      }

      await this.startScan(hash, privateMode);
      const report = await this.waitForScan(hash, privateMode);
      const parsed = this.parseResults(report);
      return this.saveResults(params.workspaceId, parsed);
    } finally {
      await unlink(params.filePath).catch(() => undefined);
    }
  }

  async listScans(workspaceId: string, limit = 25): Promise<ScanResult[]> {
    const scans = await this.scans.listByWorkspace(workspaceId, limit);
    return scans.map((scan) => this.toScanResult(scan));
  }

  async getScan(workspaceId: string, scanId: string): Promise<ScanResult> {
    const scan = await this.scans.findById(workspaceId, scanId);
    if (!scan) {
      throw new AppError("Mobile scan result not found.", 404, {
        scanId,
        workspaceId
      });
    }

    return this.toScanResult(scan);
  }

  async deleteScan(workspaceId: string, scanId: string): Promise<void> {
    const deleted = await this.scans.deleteById(workspaceId, scanId);
    if (!deleted) {
      throw new AppError("Mobile scan result not found.", 404, {
        scanId,
        workspaceId
      });
    }
  }

  async exportScan(
    workspaceId: string,
    scanId: string,
    format: MobileScanExportFormat
  ): Promise<MobileScanExportResult> {
    const scan = await this.getScan(workspaceId, scanId);
    const baseFileName = this.sanitizeFileName(
      `${scan.appName || scan.packageName || "mobile-scan"}-${scan.id}`
    );

    if (format === "json") {
      return {
        contentType: "application/json; charset=utf-8",
        fileName: `${baseFileName}.json`,
        body: Buffer.from(JSON.stringify(scan, null, 2), "utf8")
      };
    }

    return {
      contentType: "application/pdf",
      fileName: `${baseFileName}.pdf`,
      body: this.buildPdfExport(scan)
    };
  }

  /**
   * UPLOAD TO MOBSF
   * Must support Tor proxy when Private Mode active
   */
  private async uploadToMobSF(
    filePath: string,
    fileName: string,
    privateMode: PrivateModeStatus
  ): Promise<Record<string, unknown>> {
    const fileBuffer = await fs.promises.readFile(filePath);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileBuffer], {
        type: "application/octet-stream"
      }),
      fileName
    );

    const response = await this.requestMobSF<Record<string, unknown>>({
      method: "POST",
      endpoint: "/api/v1/upload",
      privateMode,
      data: formData,
      timeoutMs: 300_000
    });

    this.assertSuccessfulMobSFResponse(response, "upload the mobile application");
    return isRecord(response.data) ? response.data : {};
  }

  /**
   * START MOBSF SCAN
   */
  private async startScan(
    hash: string,
    privateMode: PrivateModeStatus
  ): Promise<Record<string, unknown>> {
    const response = await this.requestMobSF<Record<string, unknown>>({
      method: "POST",
      endpoint: "/api/v1/scan",
      privateMode,
      data: new URLSearchParams({
        hash,
        re_scan: "0"
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeoutMs: 300_000
    });

    this.assertSuccessfulMobSFResponse(response, "start the MobSF scan");
    return isRecord(response.data) ? response.data : {};
  }

  /**
   * WAIT FOR SCAN COMPLETION
   * Must poll status endpoint
   * Must timeout after 10 minutes
   */
  private async waitForScan(
    scanId: string,
    privateMode: PrivateModeStatus
  ): Promise<Record<string, unknown>> {
    let lastObservedState = "scan queued";
    let lastLogs: ScanLogEntry[] = [];

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const reportResponse = await this.requestMobSF<Record<string, unknown>>({
        method: "POST",
        endpoint: "/api/v1/report_json",
        privateMode,
        data: new URLSearchParams({
          hash: scanId
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeoutMs: 120_000,
        validateStatus: () => true
      });

      if (reportResponse.status >= 200 && reportResponse.status < 300) {
        const report = isRecord(reportResponse.data) ? reportResponse.data : {};
        const scorecard = await this.fetchScorecard(scanId, privateMode).catch(
          () => null
        );

        if (scorecard && !isRecord(report.appsec)) {
          report.appsec = scorecard;
        }

        if (lastLogs.length > 0 && !report.logs) {
          report.logs = lastLogs;
        }

        return report;
      }

      if (reportResponse.status !== 404) {
        this.logger.warn(
          {
            scanId,
            attempt,
            status: reportResponse.status,
            response: reportResponse.data
          },
          "MobSF report polling returned a non-ready response"
        );
      }

      lastLogs = await this.fetchScanLogs(scanId, privateMode).catch(() => lastLogs);
      const failureMessage = this.extractScanFailure(lastLogs);
      if (failureMessage) {
        throw new AppError("MobSF reported a scan failure.", 502, {
          scanId,
          reason: failureMessage,
          logs: lastLogs.slice(-5)
        });
      }

      lastObservedState = this.describeLatestLog(lastLogs) ?? lastObservedState;
      if (attempt < 60) {
        await sleep(10_000);
      }
    }

    throw new AppError("MobSF scan timed out after 10 minutes.", 504, {
      scanId,
      lastObservedState
    });
  }

  /**
   * PARSE MOBSF RESULTS
   * Must extract: app info, vulnerabilities, permissions, trackers, score
   */
  private parseResults(report: Record<string, unknown>): ParsedReport {
    const permissions = this.parsePermissions(report.permissions);
    const trackers = this.parseTrackers(report.trackers);
    const vulnerabilities = this.collectVulnerabilities(report, permissions, trackers);
    const securityScore =
      vulnerabilities.length > 0
        ? this.calculateScore(vulnerabilities)
        : Math.max(
            0,
            Math.min(100, asNumber(isRecord(report.appsec) ? report.appsec.security_score : undefined, 100))
          );
    const appName =
      asString(report.app_name).trim() ||
      asString(report.file_name).trim() ||
      "Unknown application";
    const packageName =
      asString(report.package_name).trim() ||
      asString(report.bundle_id).trim() ||
      "unknown.package";
    const version =
      asString(report.version_name).trim() ||
      asString(report.app_version).trim() ||
      "unknown";
    const summary = this.buildSummary(
      appName,
      vulnerabilities,
      permissions,
      trackers,
      securityScore
    );

    return {
      appName,
      packageName,
      version,
      targetSdk: asNumber(report.target_sdk),
      minSdk: asNumber(report.min_sdk),
      fileSize: asNumber(report.size),
      securityScore,
      permissions,
      vulnerabilities,
      trackers,
      summary,
      recommendations: this.generateRecommendations(
        vulnerabilities,
        permissions,
        trackers
      ),
      scanDate:
        asString(report.timestamp).trim() || new Date().toISOString()
    };
  }

  /**
   * CALCULATE SECURITY SCORE
   * Critical: -15, High: -8, Medium: -4, Low: -2
   */
  private calculateScore(vulnerabilities: Vulnerability[]): number {
    const penalties: Record<Vulnerability["severity"], number> = {
      critical: 15,
      high: 8,
      medium: 4,
      low: 2,
      info: 0
    };

    const deduction = vulnerabilities.reduce((total, vulnerability) => {
      return total + penalties[vulnerability.severity];
    }, 0);

    return Math.max(0, 100 - deduction);
  }

  /**
   * GENERATE RECOMMENDATIONS
   * Based on findings
   */
  private generateRecommendations(
    vulnerabilities: Vulnerability[],
    permissions: Permission[] = [],
    trackers: string[] = []
  ): string[] {
    const recommendations = new Set<string>();
    const normalizedText = vulnerabilities
      .map((vulnerability) =>
        `${vulnerability.title} ${vulnerability.description}`.toLowerCase()
      )
      .join(" ");

    if (vulnerabilities.some((vulnerability) => vulnerability.severity === "critical")) {
      recommendations.add(
        "Resolve the critical findings before any production release or internal redistribution."
      );
    }

    if (vulnerabilities.some((vulnerability) => vulnerability.severity === "high")) {
      recommendations.add(
        "Prioritize the high-severity issues in the next remediation sprint and verify each fix with a fresh MobSF scan."
      );
    }

    if (/hardcoded|secret|token|api key|private key|credential/.test(normalizedText)) {
      recommendations.add(
        "Remove hardcoded secrets from the app package and move sensitive material to a backend-controlled or platform keystore-backed flow."
      );
    }

    if (/crypto|cipher|des|ecb|md5|sha-1|sha1|weak random|insecure random/.test(normalizedText)) {
      recommendations.add(
        "Replace weak cryptography with modern platform-approved primitives and review all random-number generation paths."
      );
    }

    if (/cleartext|network security|ats|tls|ssl|certificate/.test(normalizedText)) {
      recommendations.add(
        "Harden transport security by disabling cleartext traffic, enforcing certificate validation, and reviewing pinning where appropriate."
      );
    }

    if (/debuggable|backup|exported|activity|service|receiver|provider|intent/.test(normalizedText)) {
      recommendations.add(
        "Tighten manifest or plist exposure: disable debug settings, review backup behavior, and restrict exported components to the minimum required surface."
      );
    }

    if (/webview|javascript interface|file access/.test(normalizedText)) {
      recommendations.add(
        "Review WebView configuration and remove unsafe JavaScript bridges, permissive file access, or overly broad navigation trust."
      );
    }

    if (permissions.some((permission) => permission.risk === "high")) {
      recommendations.add(
        "Apply least-privilege to dangerous runtime permissions and remove any permission that is not essential to the app's primary function."
      );
    }

    if (trackers.length > 0) {
      recommendations.add(
        "Review embedded trackers for privacy, data residency, and disclosure requirements before release."
      );
    }

    if (recommendations.size === 0) {
      recommendations.add(
        "No urgent remediation patterns were inferred automatically; review the full finding set and validate residual risk manually."
      );
    }

    return [...recommendations];
  }

  /**
   * CHECK PRIVATE MODE STATUS
   * Must integrate with existing Private Mode system
   */
  private async getPrivateModeStatus(
    workspaceId: string
  ): Promise<PrivateModeStatus> {
    const [session, config] = await Promise.all([
      this.privateMode.getActiveSession(workspaceId),
      this.privateMode.getConfig(workspaceId)
    ]);

    return {
      active: Boolean(session),
      torPort: config.torSocksPort
    };
  }

  /**
   * SAVE RESULTS TO DATABASE
   */
  private async saveResults(
    workspaceId: string,
    results: ParsedReport
  ): Promise<ScanResult> {
    const saved = await this.scans.create({
      workspaceId,
      report: results
    });

    return this.toScanResult(saved);
  }

  private async requestMobSF<T>(options: {
    method: "GET" | "POST";
    endpoint: string;
    privateMode: PrivateModeStatus;
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
    validateStatus?: (status: number) => boolean;
  }): Promise<AxiosResponse<T>> {
    const url = new URL(
      options.endpoint.replace(/^\//, ""),
      this.mobsfUrl.endsWith("/") ? this.mobsfUrl : `${this.mobsfUrl}/`
    );
    const agent =
      options.privateMode.active && !this.isLocalMobSFHost(url.hostname)
        ? await this.createTorAgent(options.privateMode.torPort)
        : undefined;

    return axios.request<T>({
      method: options.method,
      url: url.toString(),
      data: options.data,
      timeout: options.timeoutMs ?? 60_000,
      maxBodyLength: Number.POSITIVE_INFINITY,
      maxContentLength: Number.POSITIVE_INFINITY,
      proxy: false,
      headers: {
        Accept: "application/json",
        ...this.buildAuthHeaders(),
        ...(options.headers ?? {})
      },
      ...(agent
        ? {
            httpAgent: agent,
            httpsAgent: agent
          }
        : {}),
      validateStatus: options.validateStatus
    });
  }

  private buildAuthHeaders(): Record<string, string> {
    if (!this.mobsfApiKey.trim()) {
      return {};
    }

    return {
      Authorization: this.mobsfApiKey,
      "X-Mobsf-Api-Key": this.mobsfApiKey
    };
  }

  private async createTorAgent(torPort: number) {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    return new SocksProxyAgent(`socks5h://127.0.0.1:${torPort}`);
  }

  private isLocalMobSFHost(hostname: string): boolean {
    const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1"
    );
  }

  private assertSuccessfulMobSFResponse(
    response: AxiosResponse<unknown>,
    action: string
  ): void {
    if (response.status >= 200 && response.status < 300) {
      return;
    }

    throw new AppError(`Failed to ${action} via MobSF.`, 502, {
      statusCode: response.status,
      response: response.data
    });
  }

  private async fetchScorecard(
    hash: string,
    privateMode: PrivateModeStatus
  ): Promise<Record<string, unknown>> {
    const response = await this.requestMobSF<Record<string, unknown>>({
      method: "POST",
      endpoint: "/api/v1/scorecard",
      privateMode,
      data: new URLSearchParams({
        hash
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      validateStatus: () => true
    });

    if (response.status >= 200 && response.status < 300 && isRecord(response.data)) {
      return response.data;
    }

    throw new AppError("MobSF scorecard was not ready.", 404, {
      statusCode: response.status
    });
  }

  private async fetchScanLogs(
    hash: string,
    privateMode: PrivateModeStatus
  ): Promise<ScanLogEntry[]> {
    const response = await this.requestMobSF<{
      logs?: ScanLogEntry[];
    }>({
      method: "POST",
      endpoint: "/api/v1/scan_logs",
      privateMode,
      data: new URLSearchParams({
        hash
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      validateStatus: () => true
    });

    if (response.status >= 200 && response.status < 300 && response.data?.logs) {
      return asArray<ScanLogEntry>(response.data.logs);
    }

    return [];
  }

  private extractScanFailure(logs: ScanLogEntry[]): string | null {
    for (const log of [...logs].reverse()) {
      const exception = asString(log.exception).trim();
      if (exception) {
        return exception;
      }
    }

    return null;
  }

  private describeLatestLog(logs: ScanLogEntry[]): string | null {
    const latest = [...logs].reverse().find((log) => asString(log.status).trim());
    return latest ? asString(latest.status).trim() : null;
  }

  private parsePermissions(rawPermissions: unknown): Permission[] {
    if (!isRecord(rawPermissions)) {
      return [];
    }

    return Object.entries(rawPermissions).map(([name, metadata]) => {
      const permissionMetadata = isRecord(metadata) ? metadata : {};
      const status = asString(permissionMetadata.status).toLowerCase();
      const description = stripHtml(asString(permissionMetadata.description));
      const reason = stripHtml(
        asString(permissionMetadata.info) || asString(permissionMetadata.reason)
      );

      const normalizedStatus: Permission["status"] =
        status === "dangerous" || status === "normal" || status === "signature"
          ? status
          : "unknown";

      return {
        name,
        status: normalizedStatus,
        risk:
          normalizedStatus === "dangerous"
            ? "high"
            : normalizedStatus === "signature"
              ? "medium"
              : "low",
        description: description || "No description provided by MobSF.",
        reason: reason || "No additional permission context provided by MobSF."
      };
    });
  }

  private parseTrackers(rawTrackers: unknown): string[] {
    if (isRecord(rawTrackers) && Array.isArray(rawTrackers.trackers)) {
      return rawTrackers.trackers
        .map((tracker) => {
          if (typeof tracker === "string") {
            return tracker;
          }
          if (isRecord(tracker)) {
            return asString(tracker.name || tracker.tracker || tracker.exodus_id);
          }
          return "";
        })
        .filter(Boolean);
    }

    return asArray<string>(rawTrackers).filter(
      (tracker): tracker is string => typeof tracker === "string" && tracker.trim().length > 0
    );
  }

  private collectVulnerabilities(
    report: Record<string, unknown>,
    permissions: Permission[],
    trackers: string[]
  ): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const seen = new Set<string>();

    const pushVulnerability = (vulnerability: Omit<Vulnerability, "id">) => {
      const title = stripHtml(vulnerability.title);
      const description = stripHtml(vulnerability.description);
      if (!title || !description) {
        return;
      }

      const key = [
        vulnerability.severity,
        title.toLowerCase(),
        vulnerability.file.toLowerCase(),
        String(vulnerability.line)
      ].join("|");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      vulnerabilities.push({
        id: uuidv4(),
        title,
        severity: vulnerability.severity,
        description,
        file: vulnerability.file || "unknown",
        line: vulnerability.line,
        remediation: stripHtml(vulnerability.remediation)
      });
    };

    const severityFromValue = (value: unknown): Vulnerability["severity"] | null => {
      const normalized = asString(value).trim().toLowerCase();
      switch (normalized) {
        case "critical":
          return "critical";
        case "high":
          return "high";
        case "warning":
        case "medium":
        case "hotspot":
          return "medium";
        case "low":
          return "low";
        case "info":
          return "info";
        case "good":
        case "secure":
          return null;
        default:
          return normalized ? "low" : null;
      }
    };

    const addStructuredFinding = (
      title: unknown,
      severity: unknown,
      description: unknown,
      remediation: string,
      file = "unknown",
      line = 0
    ) => {
      const normalizedSeverity = severityFromValue(severity);
      if (!normalizedSeverity) {
        return;
      }

      pushVulnerability({
        title: asString(title),
        severity: normalizedSeverity,
        description: asString(description),
        file,
        line,
        remediation
      });
    };

    if (
      isRecord(report.manifest_analysis) &&
      Array.isArray(report.manifest_analysis.manifest_findings)
    ) {
      for (const finding of report.manifest_analysis.manifest_findings) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          finding.title,
          finding.severity,
          finding.description,
          "Review the manifest configuration and remove the exposed or unsafe capability if it is not explicitly required.",
          "AndroidManifest.xml"
        );
      }
    }

    if (
      isRecord(report.certificate_analysis) &&
      Array.isArray(report.certificate_analysis.certificate_findings)
    ) {
      for (const finding of report.certificate_analysis.certificate_findings) {
        const values = asArray<unknown>(finding);
        addStructuredFinding(
          values[2],
          values[0],
          values[1],
          "Review the certificate handling, signing configuration, and bundled trust material."
        );
      }
    }

    if (
      isRecord(report.network_security) &&
      Array.isArray(report.network_security.network_findings)
    ) {
      for (const finding of report.network_security.network_findings) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          finding.description,
          finding.severity,
          `${asString(finding.description)}\n${asArray<string>(finding.scope).join("\n")}`,
          "Harden network security policy, remove cleartext exceptions, and validate remote trust decisions."
        );
      }
    }

    if (isRecord(report.ats_analysis) && Array.isArray(report.ats_analysis.ats_findings)) {
      for (const finding of report.ats_analysis.ats_findings) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          finding.issue,
          finding.severity,
          finding.description,
          "Tighten App Transport Security and remove insecure transport exceptions from the iOS configuration.",
          "Info.plist"
        );
      }
    }

    if (isRecord(report.macho_analysis)) {
      for (const [key, finding] of Object.entries(report.macho_analysis)) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          key,
          finding.severity,
          finding.description,
          "Rebuild the binary with the recommended compiler and linker hardening flags enabled."
        );
      }
    }

    const codeAnalysisFindings =
      isRecord(report.code_analysis) && isRecord(report.code_analysis.findings)
        ? report.code_analysis.findings
        : null;
    if (codeAnalysisFindings) {
      for (const [title, finding] of Object.entries(codeAnalysisFindings)) {
        if (!isRecord(finding) || !isRecord(finding.metadata)) {
          continue;
        }

        const descriptionParts = [
          asString(finding.metadata.description),
          asString(finding.metadata.ref)
        ].filter(Boolean);
        const files = isRecord(finding.files) ? Object.entries(finding.files) : [];

        if (files.length === 0) {
          addStructuredFinding(
            title,
            finding.metadata.severity,
            descriptionParts.join("\n\n"),
            "Review the affected code path and remove the insecure pattern flagged by MobSF."
          );
          continue;
        }

        for (const [file, lines] of files) {
          const numericLine = asNumber(
            Array.isArray(lines) ? lines[0] : typeof lines === "string" ? lines.split(",")[0] : lines
          );
          addStructuredFinding(
            title,
            finding.metadata.severity,
            descriptionParts.join("\n\n"),
            "Review the affected code path and remove the insecure pattern flagged by MobSF.",
            file,
            numericLine
          );
        }
      }
    }

    const binaryCodeFindings =
      isRecord(report.binary_analysis) && isRecord(report.binary_analysis.findings)
        ? report.binary_analysis.findings
        : null;
    if (binaryCodeFindings) {
      for (const [title, finding] of Object.entries(binaryCodeFindings)) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          title,
          finding.severity,
          finding.detailed_desc || finding.description,
          "Review the binary analysis finding and rebuild the app with the recommended secure defaults."
        );
      }
    }

    if (Array.isArray(report.file_analysis)) {
      for (const finding of report.file_analysis) {
        if (!isRecord(finding)) {
          continue;
        }

        const title =
          asString(finding.issue).trim() ||
          asString(finding.finding).trim() ||
          "Suspicious file artifact";
        const fileEntries = Array.isArray(finding.files) ? finding.files : [];
        const description = [
          asString(finding.description),
          ...fileEntries.map((entry) => {
            if (typeof entry === "string") {
              return entry;
            }
            if (isRecord(entry)) {
              return asString(entry.file_path || entry.file || entry.path);
            }
            return "";
          })
        ]
          .filter(Boolean)
          .join("\n");

        addStructuredFinding(
          title,
          finding.severity || "low",
          description,
          "Remove development artifacts, embedded credentials, or unnecessary files from the application package."
        );
      }
    }

    if (Array.isArray(report.firebase_urls)) {
      for (const finding of report.firebase_urls) {
        if (!isRecord(finding)) {
          continue;
        }

        addStructuredFinding(
          finding.title,
          finding.severity,
          finding.description,
          "Review Firebase exposure and restrict unauthenticated data access."
        );
      }
    }

    if (isRecord(report.domains)) {
      for (const [domain, metadata] of Object.entries(report.domains)) {
        if (!isRecord(metadata)) {
          continue;
        }

        if (asString(metadata.bad).toLowerCase() === "yes") {
          addStructuredFinding(
            `Malicious domain reference: ${domain}`,
            "high",
            JSON.stringify(metadata.geolocation ?? {}),
            "Remove malicious or untrusted domain references from the application and verify the dependency path."
          );
        }
      }
    }

    for (const secret of asArray<string>(report.secrets)) {
      if (!secret.trim()) {
        continue;
      }

      addStructuredFinding(
        "Potential hardcoded secret",
        "medium",
        secret,
        "Move secrets out of the mobile binary and rotate any credential that was bundled with the app."
      );
    }

    if (vulnerabilities.length === 0 && isRecord(report.appsec)) {
      for (const severityKey of ["high", "warning", "hotspot", "info"] as const) {
        const findings = asArray<Record<string, unknown>>(report.appsec[severityKey]);
        for (const finding of findings) {
          addStructuredFinding(
            finding.title,
            severityKey,
            finding.description,
            "Review the scorecard finding and remediate the flagged insecure behavior.",
            asString(finding.section)
          );
        }
      }
    }

    if (
      permissions.some((permission) => permission.risk === "high") &&
      !vulnerabilities.some((vulnerability) => /permission/i.test(vulnerability.title))
    ) {
      addStructuredFinding(
        "Dangerous permissions requested",
        "medium",
        permissions
          .filter((permission) => permission.risk === "high")
          .map(
            (permission) =>
              `${permission.name}: ${permission.reason || permission.description}`
          )
          .join("\n"),
        "Reduce the runtime permission surface and justify each dangerous permission against an actual product requirement.",
        "AndroidManifest.xml"
      );
    }

    if (trackers.length > 0) {
      addStructuredFinding(
        "Embedded privacy trackers detected",
        trackers.length > 4 ? "medium" : "low",
        trackers.join(", "),
        "Review third-party tracker usage against privacy, compliance, and user-consent requirements."
      );
    }

    return vulnerabilities.sort((left, right) => {
      const severityWeight: Record<Vulnerability["severity"], number> = {
        critical: 5,
        high: 4,
        medium: 3,
        low: 2,
        info: 1
      };

      return (
        severityWeight[right.severity] - severityWeight[left.severity] ||
        left.title.localeCompare(right.title)
      );
    });
  }

  private buildSummary(
    appName: string,
    vulnerabilities: Vulnerability[],
    permissions: Permission[],
    trackers: string[],
    securityScore: number
  ): Summary {
    const counts = vulnerabilities.reduce<Summary>(
      (summary, vulnerability) => {
        summary[vulnerability.severity] += 1;
        summary.totalVulnerabilities += 1;
        return summary;
      },
      {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        totalPermissions: permissions.length,
        riskyPermissions: permissions.filter((permission) => permission.risk !== "low")
          .length,
        trackerCount: trackers.length,
        riskLevel: "low",
        headline: ""
      }
    );

    const riskLevel: Summary["riskLevel"] =
      counts.critical > 0
        ? "critical"
        : counts.high > 0
          ? "high"
          : counts.medium > 0 || securityScore < 80
            ? "medium"
            : "low";

    return {
      ...counts,
      riskLevel,
      headline:
        riskLevel === "critical"
          ? `${appName} contains critical mobile security findings that need immediate remediation.`
          : riskLevel === "high"
            ? `${appName} exposes high-risk mobile security issues that should be addressed before release.`
            : riskLevel === "medium"
              ? `${appName} shows moderate mobile security weaknesses and should be hardened further.`
              : `${appName} has a comparatively low-risk static posture based on the current MobSF findings.`
    };
  }

  private toScanResult(scan: MobileScanResultEntity): ScanResult {
    return {
      id: scan.id,
      workspaceId: scan.workspaceId,
      appName: scan.appName,
      packageName: scan.packageName,
      version: scan.version,
      targetSdk: scan.targetSdk,
      minSdk: scan.minSdk,
      fileSize: scan.fileSize,
      securityScore: scan.securityScore,
      permissions: scan.permissions,
      vulnerabilities: scan.vulnerabilities,
      trackers: scan.trackers,
      summary: scan.summary,
      recommendations: scan.recommendations,
      scanDate: scan.scanDate
    };
  }

  private buildPdfExport(scan: ScanResult): Buffer {
    const lines = [
      "Mobile Security Scan Report",
      "",
      `Application: ${scan.appName}`,
      `Package: ${scan.packageName}`,
      `Version: ${scan.version}`,
      `Security score: ${scan.securityScore}/100`,
      `Scan date: ${scan.scanDate}`,
      `Target SDK: ${scan.targetSdk || "n/a"}`,
      `Minimum SDK: ${scan.minSdk || "n/a"}`,
      `File size: ${scan.fileSize} bytes`,
      "",
      "Summary",
      `- Risk level: ${scan.summary.riskLevel}`,
      `- Total vulnerabilities: ${scan.summary.totalVulnerabilities}`,
      `- Critical: ${scan.summary.critical}`,
      `- High: ${scan.summary.high}`,
      `- Medium: ${scan.summary.medium}`,
      `- Low: ${scan.summary.low}`,
      `- Info: ${scan.summary.info}`,
      `- Risky permissions: ${scan.summary.riskyPermissions}/${scan.summary.totalPermissions}`,
      `- Trackers: ${scan.summary.trackerCount}`,
      "",
      "Recommendations"
    ];

    if (scan.recommendations.length === 0) {
      lines.push("- No recommendations generated.");
    } else {
      for (const recommendation of scan.recommendations) {
        lines.push(`- ${recommendation}`);
      }
    }

    lines.push("", "Permissions");
    if (scan.permissions.length === 0) {
      lines.push("- No permissions reported.");
    } else {
      for (const permission of scan.permissions) {
        lines.push(
          `- ${permission.name} [${permission.risk}] (${permission.status}): ${permission.reason || permission.description}`
        );
      }
    }

    lines.push("", "Trackers");
    if (scan.trackers.length === 0) {
      lines.push("- No trackers detected.");
    } else {
      for (const tracker of scan.trackers) {
        lines.push(`- ${tracker}`);
      }
    }

    lines.push("", "Vulnerabilities");
    if (scan.vulnerabilities.length === 0) {
      lines.push("- No vulnerabilities reported.");
    } else {
      for (const vulnerability of scan.vulnerabilities) {
        lines.push(
          `- [${vulnerability.severity.toUpperCase()}] ${vulnerability.title}`
        );
        lines.push(`  File: ${vulnerability.file}  Line: ${vulnerability.line || "n/a"}`);
        lines.push(`  ${vulnerability.description}`);
        lines.push(`  Remediation: ${vulnerability.remediation}`);
      }
    }

    return this.buildPdfDocument(
      lines.flatMap((line) => this.wrapLine(line, 94))
    );
  }

  private buildPdfDocument(lines: string[]): Buffer {
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const sharedFontObjectId = 3;
    const linesPerPage = 48;
    const pages = Math.max(1, Math.ceil(lines.length / linesPerPage));

    objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[1] = "";
    objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    let nextObjectId = 4;

    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
      const pageLines = lines.slice(
        pageIndex * linesPerPage,
        (pageIndex + 1) * linesPerPage
      );
      const contentCommands = [
        "BT",
        "/F1 10 Tf",
        "50 760 Td",
        "14 TL",
        ...pageLines.map((line) => `(${this.escapePdfText(line)}) Tj T*`),
        "ET"
      ].join("\n");

      const contentObjectId = nextObjectId;
      const pageObjectId = nextObjectId + 1;
      nextObjectId += 2;

      objects[contentObjectId - 1] = `<< /Length ${Buffer.byteLength(
        contentCommands,
        "utf8"
      )} >>\nstream\n${contentCommands}\nendstream`;
      objects[pageObjectId - 1] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${sharedFontObjectId} 0 R >> >> ` +
        `/Contents ${contentObjectId} 0 R >>`;
      pageObjectIds.push(pageObjectId);
    }

    objects[1] = `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pageObjectIds.length} >>`;

    const pdfParts = ["%PDF-1.4\n"];
    const offsets = [0];

    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.byteLength(pdfParts.join(""), "utf8"));
      pdfParts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
    }

    const xrefOffset = Buffer.byteLength(pdfParts.join(""), "utf8");
    pdfParts.push(`xref\n0 ${objects.length + 1}\n`);
    pdfParts.push("0000000000 65535 f \n");

    for (let index = 1; index < offsets.length; index += 1) {
      pdfParts.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    }

    pdfParts.push(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    );

    return Buffer.from(pdfParts.join(""), "utf8");
  }

  private wrapLine(line: string, maxLength: number): string[] {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [""];
    }

    const wrapped: string[] = [];
    let remaining = normalized;

    while (remaining.length > maxLength) {
      const breakIndex = remaining.lastIndexOf(" ", maxLength);
      const splitAt = breakIndex > 0 ? breakIndex : maxLength;
      wrapped.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) {
      wrapped.push(remaining);
    }

    return wrapped;
  }

  private escapePdfText(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  private sanitizeFileName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "mobile-scan";
  }
}
