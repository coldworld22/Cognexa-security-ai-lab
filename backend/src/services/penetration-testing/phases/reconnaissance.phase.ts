import { randomUUID } from "crypto";

import type { Logger } from "pino";
import { z } from "zod";

import type { AccessContext } from "../../../authorization/authorization.types";
import { AppError } from "../../../utils/app-error";
import type { LLMService } from "../../llm/llm.service";
import type {
  SecurityReviewCheck,
  SecurityReviewFinding,
  SecurityReviewResult,
  SecurityReviewService as SecurityReviewLab
} from "../../security-review/security-review.service";
import type { Vulnerability } from "../penetration-test-orchestrator.service";

export interface ReconResult {
  technologies: string[];
  endpoints: string[];
  vulnerabilities: Vulnerability[];
  misconfigurations: string[];
  highValueTargets: string[];
  aiAnalysis: any;
  priority: "high" | "medium" | "low";
}

export interface ReconnaissancePhaseOptions {
  actor?: AccessContext;
  maxPages?: number;
  defaultProvider?: string;
  defaultModel?: string;
  onProgress?: (phase: string, message: string) => void;
}

interface AiProviderSelection {
  provider: string;
  model: string;
}

interface ReconAiAnalysis {
  status: "ready" | "unavailable";
  provider?: string;
  model?: string;
  headline?: string;
  reasoning?: string;
  technologies: string[];
  endpoints: string[];
  vulnerabilities: Array<{
    type: string;
    severity: Vulnerability["severity"];
    location: string;
    rationale: string;
  }>;
  misconfigurations: string[];
  highValueTargets: string[];
  priority?: ReconResult["priority"];
  nextSteps: string[];
  unavailableReason?: string;
}

export class ReconnaissancePhase {
  private readonly actor?: AccessContext;
  private readonly maxPages: number;
  private readonly defaultProvider?: string;
  private readonly defaultModel?: string;
  private readonly onProgress?: ReconnaissancePhaseOptions["onProgress"];

  constructor(
    private readonly passiveScanner: SecurityReviewLab,
    private readonly llm: LLMService,
    private readonly logger: Logger,
    options: ReconnaissancePhaseOptions = {}
  ) {
    this.actor = options.actor;
    this.maxPages = this.normalizeMaxPages(options.maxPages);
    this.defaultProvider = options.defaultProvider?.trim() || undefined;
    this.defaultModel = options.defaultModel?.trim() || undefined;
    this.onProgress = options.onProgress;
  }

  async execute(target: string): Promise<ReconResult> {
    const normalizedTarget = this.normalizeTarget(target);
    this.emitProgress("recon", "Starting passive reconnaissance scan.");
    this.logger.info(
      {
        target: normalizedTarget,
        maxPages: this.maxPages
      },
      "Reconnaissance phase started"
    );

    try {
      const scanData = await this.runPassiveScan(normalizedTarget);
      this.emitProgress("recon", "Passive scan completed. Running AI analysis.");

      const aiAnalysis = await this.analyzeWithAI(scanData);
      const vulnerabilities = this.mergeVulnerabilities([
        ...this.extractVulnerabilities(scanData),
        ...this.extractAiVulnerabilities(aiAnalysis, scanData.target.finalUrl)
      ]);

      const result = this.prioritizeFindings(
        {
          technologies: this.extractTechnologies(scanData, aiAnalysis),
          endpoints: this.extractEndpoints(scanData, aiAnalysis),
          vulnerabilities,
          misconfigurations: this.extractMisconfigurations(scanData, aiAnalysis),
          highValueTargets: this.extractHighValueTargets(
            scanData,
            vulnerabilities,
            aiAnalysis
          ),
          aiAnalysis
        },
        scanData
      );

      this.logger.info(
        {
          target: normalizedTarget,
          technologies: result.technologies.length,
          endpoints: result.endpoints.length,
          vulnerabilities: result.vulnerabilities.length,
          misconfigurations: result.misconfigurations.length,
          highValueTargets: result.highValueTargets.length,
          priority: result.priority
        },
        "Reconnaissance phase completed"
      );
      this.emitProgress("recon", "Reconnaissance phase completed.");
      return result;
    } catch (error) {
      this.logger.error(
        {
          error,
          target: normalizedTarget
        },
        "Reconnaissance phase failed"
      );
      this.emitProgress("recon", "Reconnaissance phase failed.");

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Reconnaissance phase failed.", 502, {
        target: normalizedTarget,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async analyzeWithAI(scanData: SecurityReviewResult): Promise<ReconAiAnalysis> {
    const providerSelection = await this.selectAiProviderAndModel();
    if (!providerSelection) {
      this.logger.warn(
        {
          target: scanData.target.finalUrl
        },
        "Skipping AI reconnaissance analysis because no LLM provider is available"
      );
      return {
        status: "unavailable",
        technologies: [],
        endpoints: [],
        vulnerabilities: [],
        misconfigurations: [],
        highValueTargets: [],
        nextSteps: [],
        unavailableReason: "No installed LLM provider is currently available."
      };
    }

    const schema = z.object({
      headline: z.string().min(1).max(240),
      reasoning: z.string().min(1).max(420),
      technologies: z.array(z.string().min(1).max(120)).max(12).default([]),
      endpoints: z.array(z.string().min(1).max(240)).max(20).default([]),
      vulnerabilities: z
        .array(
          z.object({
            type: z.string().min(1).max(120),
            severity: z.enum(["critical", "high", "medium", "low"]),
            location: z.string().min(1).max(240),
            rationale: z.string().min(1).max(260)
          })
        )
        .max(10)
        .default([]),
      misconfigurations: z.array(z.string().min(1).max(240)).max(10).default([]),
      highValueTargets: z.array(z.string().min(1).max(240)).max(12).default([]),
      priority: z.enum(["high", "medium", "low"]),
      nextSteps: z.array(z.string().min(1).max(200)).max(6).default([])
    });

    const promptPayload = {
      target: scanData.target,
      posture: scanData.posture,
      summary: scanData.summary,
      existingSecurityReviewAiAnalysis: scanData.aiAnalysis,
      warnings: scanData.warnings.slice(0, 8),
      checks: scanData.checks
        .filter((check) => check.status === "fail" || check.status === "warn")
        .slice(0, 10)
        .map((check) => ({
          name: check.name,
          category: check.category,
          status: check.status,
          observed: check.observed
        })),
      findings: scanData.findings.slice(0, 10).map((finding) => ({
        title: finding.title,
        category: finding.category,
        severity: finding.severity,
        pageUrl: finding.pageUrl,
        summary: finding.summary,
        evidence: finding.evidence.slice(0, 3),
        remediation: finding.remediation
      })),
      attackPaths: scanData.attackPaths.slice(0, 8).map((path) => ({
        title: path.title,
        status: path.status,
        attackerGoal: path.attackerGoal,
        narrative: path.narrative,
        example: path.example,
        blockers: path.blockers,
        nextAction: path.nextAction
      })),
      endpoints: this.extractEndpoints(scanData).slice(0, 20),
      technologies: this.extractTechnologies(scanData),
      highValueTargets: this.extractHighValueTargets(scanData, this.extractVulnerabilities(scanData))
    };

    try {
      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are a defensive reconnaissance analyst embedded in an authorized passive penetration testing workflow. Use only the provided passive scan evidence. Do not provide exploits, payloads, bypasses, brute force steps, or destructive actions. Return concise structured analysis that identifies technologies, reachable endpoints, likely vulnerabilities, misconfigurations, and the highest-value targets for safe follow-up validation."
            },
            {
              role: "user",
              content: `Analyze this passive reconnaissance dataset and return a structured assessment:\n${JSON.stringify(
                promptPayload
              )}`
            }
          ]
        },
        schema,
        this.actor
          ? {
              actor: this.actor,
              action: "admin.penetration_test.reconnaissance.ai_analysis",
              content:
                "Generate defensive reconnaissance analysis from passive scan evidence.",
              metadata: {
                passiveOnly: true,
                target: scanData.target.finalUrl,
                maxPages: scanData.target.maxPages
              }
            }
          : undefined
      );

      return {
        status: "ready",
        provider: providerSelection.provider,
        model: providerSelection.model,
        headline: response.headline,
        reasoning: response.reasoning,
        technologies: response.technologies,
        endpoints: response.endpoints,
        vulnerabilities: response.vulnerabilities,
        misconfigurations: response.misconfigurations,
        highValueTargets: response.highValueTargets,
        priority: response.priority,
        nextSteps: response.nextSteps
      };
    } catch (error) {
      this.logger.warn(
        {
          error,
          target: scanData.target.finalUrl,
          provider: providerSelection.provider,
          model: providerSelection.model
        },
        "AI reconnaissance analysis unavailable"
      );
      return {
        status: "unavailable",
        provider: providerSelection.provider,
        model: providerSelection.model,
        technologies: [],
        endpoints: [],
        vulnerabilities: [],
        misconfigurations: [],
        highValueTargets: [],
        nextSteps: [],
        unavailableReason:
          error instanceof Error ? error.message : "AI reconnaissance analysis failed."
      };
    }
  }

  private extractVulnerabilities(scanData: SecurityReviewResult): Vulnerability[] {
    if (!Array.isArray(scanData.findings)) {
      return [];
    }

    return scanData.findings
      .map((finding) => this.toPassiveVulnerability(finding, scanData.target.finalUrl))
      .sort((left, right) => {
        const severityDelta = this.compareSeverity(right.severity, left.severity);
        if (severityDelta !== 0) {
          return severityDelta;
        }

        return right.confidence - left.confidence;
      });
  }

  private prioritizeFindings(
    findings: Omit<ReconResult, "priority">,
    scanData: SecurityReviewResult
  ): ReconResult {
    const vulnerabilities = this.mergeVulnerabilities(findings.vulnerabilities);
    const exposedAttackPaths = scanData.attackPaths.filter(
      (path) => path.status === "exposed"
    ).length;

    let priority: ReconResult["priority"] = "low";
    if (
      scanData.summary.riskLevel === "critical" ||
      scanData.summary.riskLevel === "high" ||
      vulnerabilities.some(
        (vulnerability) =>
          vulnerability.severity === "critical" ||
          vulnerability.severity === "high"
      ) ||
      exposedAttackPaths > 0 ||
      findings.aiAnalysis?.priority === "high"
    ) {
      priority = "high";
    } else if (
      scanData.summary.riskLevel === "medium" ||
      vulnerabilities.some((vulnerability) => vulnerability.severity === "medium") ||
      findings.misconfigurations.length >= 3 ||
      findings.highValueTargets.length > 0 ||
      findings.aiAnalysis?.priority === "medium"
    ) {
      priority = "medium";
    }

    return {
      technologies: this.dedupeStrings(findings.technologies).slice(0, 12),
      endpoints: this.dedupeStrings(findings.endpoints).slice(0, 20),
      vulnerabilities,
      misconfigurations: this.dedupeStrings(findings.misconfigurations).slice(0, 12),
      highValueTargets: this.dedupeStrings(findings.highValueTargets).slice(0, 12),
      aiAnalysis: findings.aiAnalysis,
      priority
    };
  }

  private emitProgress(phase: string, message: string): void {
    this.logger.info(
      {
        phase,
        message
      },
      "Reconnaissance phase progress"
    );
    this.onProgress?.(phase, message);
  }

  private async runPassiveScan(target: string): Promise<SecurityReviewResult> {
    const scanner = this.passiveScanner as unknown as {
      runReview?: (...args: unknown[]) => Promise<SecurityReviewResult>;
    };
    if (typeof scanner.runReview !== "function") {
      throw new AppError(
        "ReconnaissancePhase requires a SecurityReviewLab-compatible passive scanner.",
        500
      );
    }

    const scanRequest = {
      url: target,
      maxPages: this.maxPages
    };

    if (this.actor) {
      return scanner.runReview(this.actor, scanRequest);
    }

    if (scanner.runReview.length <= 1) {
      return scanner.runReview(scanRequest);
    }

    throw new AppError(
      "ReconnaissancePhase requires an AccessContext to execute SecurityReviewLab.runReview(...).",
      500,
      {
        target
      }
    );
  }

  private async selectAiProviderAndModel(): Promise<AiProviderSelection | null> {
    const providers = await this.llm.listProviders();
    const availableProviders = providers.filter((provider) => provider.models.length > 0);
    if (availableProviders.length === 0) {
      return null;
    }

    const preferredProvider =
      (this.defaultProvider
        ? availableProviders.find((provider) => provider.id === this.defaultProvider)
        : undefined) ?? availableProviders[0];
    if (!preferredProvider) {
      return null;
    }

    const requestedModel = this.defaultModel;
    const preferredModel =
      (requestedModel
        ? preferredProvider.models.find(
            (model) =>
              this.normalizeModelName(model) ===
              this.normalizeModelName(requestedModel)
          )
        : undefined) ?? preferredProvider.models[0];
    if (!preferredModel) {
      return null;
    }

    return {
      provider: preferredProvider.id,
      model: preferredModel
    };
  }

  private extractAiVulnerabilities(
    aiAnalysis: ReconAiAnalysis,
    defaultLocation: string
  ): Vulnerability[] {
    if (aiAnalysis.status !== "ready" || aiAnalysis.vulnerabilities.length === 0) {
      return [];
    }

    return aiAnalysis.vulnerabilities.map((finding, index) => ({
      id: `ai-recon-${index}-${randomUUID()}`,
      type: finding.type,
      severity: finding.severity,
      location: this.normalizeEndpoint(finding.location, defaultLocation) ?? defaultLocation,
      description: finding.rationale,
      evidence: "AI correlation from passive reconnaissance evidence.",
      remediation: "Validate this surface manually and apply the recommended hardening.",
      confidence:
        finding.severity === "critical" || finding.severity === "high" ? 0.65 : 0.55,
      exploitable: false
    }));
  }

  private extractTechnologies(
    scanData: SecurityReviewResult,
    aiAnalysis?: ReconAiAnalysis
  ): string[] {
    const technologies = [
      ...scanData.checks.flatMap((check) => this.deriveTechnologiesFromCheck(check)),
      ...scanData.findings.flatMap((finding) => this.deriveTechnologiesFromFinding(finding)),
      ...scanData.attackPaths.flatMap((path) =>
        this.deriveTechnologiesFromText(
          [path.title, path.narrative, path.example, path.nextAction].join(" ")
        )
      ),
      ...this.deriveTechnologiesFromText(
        [
          scanData.summary.headline,
          ...scanData.summary.topRisks,
          scanData.aiAnalysis.headline ?? "",
          scanData.aiAnalysis.analystPerspective ?? "",
          scanData.aiAnalysis.decisiveVerdict ?? ""
        ].join(" ")
      ),
      ...(aiAnalysis?.status === "ready" ? aiAnalysis.technologies : [])
    ];

    return this.dedupeStrings(
      technologies.map((technology) => this.normalizeTechnologyName(technology))
    ).filter((technology) => technology.length > 0);
  }

  private extractEndpoints(
    scanData: SecurityReviewResult,
    aiAnalysis?: ReconAiAnalysis
  ): string[] {
    const prioritized = [
      scanData.target.finalUrl,
      ...scanData.findings
        .map((finding) => finding.pageUrl)
        .filter((pageUrl): pageUrl is string => Boolean(pageUrl)),
      ...scanData.findings.flatMap((finding) =>
        finding.evidence.flatMap((evidence) =>
          this.extractRouteCandidates(evidence, scanData.target.finalUrl)
        )
      ),
      ...scanData.checks.flatMap((check) =>
        check.evidence.flatMap((evidence) =>
          this.extractRouteCandidates(evidence, scanData.target.finalUrl)
        )
      ),
      ...scanData.attackPaths.flatMap((path) =>
        this.extractRouteCandidates(
          [path.title, path.narrative, path.example, path.nextAction].join(" "),
          scanData.target.finalUrl
        )
      ),
      ...scanData.aiAnalysis.retestFocus.flatMap((candidate) =>
        this.extractRouteCandidates(candidate, scanData.target.finalUrl)
      ),
      ...(aiAnalysis?.status === "ready" ? aiAnalysis.endpoints : [])
    ];

    return this.dedupeStrings(
      prioritized
        .map((endpoint) => this.normalizeEndpoint(endpoint, scanData.target.finalUrl))
        .filter((endpoint): endpoint is string => Boolean(endpoint))
    );
  }

  private extractMisconfigurations(
    scanData: SecurityReviewResult,
    aiAnalysis?: ReconAiAnalysis
  ): string[] {
    const checkSignals = scanData.checks
      .filter((check) => check.status === "fail" || check.status === "warn")
      .sort((left, right) => this.compareCheckStatus(left.status, right.status))
      .map((check) => `${check.name}: ${check.observed}`);

    return this.dedupeStrings([
      ...checkSignals,
      ...scanData.warnings,
      ...scanData.summary.topRisks,
      ...(aiAnalysis?.status === "ready" ? aiAnalysis.misconfigurations : [])
    ]);
  }

  private extractHighValueTargets(
    scanData: SecurityReviewResult,
    vulnerabilities: Vulnerability[],
    aiAnalysis?: ReconAiAnalysis
  ): string[] {
    const targets = [
      ...this.extractEndpoints(scanData).filter((endpoint) => this.isHighValueTarget(endpoint)),
      ...vulnerabilities
        .filter(
          (vulnerability) =>
            vulnerability.severity === "critical" ||
            vulnerability.severity === "high" ||
            this.isHighValueTarget(vulnerability.location)
        )
        .map((vulnerability) => vulnerability.location),
      ...scanData.attackPaths
        .filter((path) => path.status === "exposed" || path.status === "constrained")
        .map((path) => path.title),
      ...(aiAnalysis?.status === "ready" ? aiAnalysis.highValueTargets : [])
    ];

    return this.dedupeStrings(targets);
  }

  private toPassiveVulnerability(
    finding: SecurityReviewFinding,
    defaultLocation: string
  ): Vulnerability {
    return {
      id: finding.id,
      type: this.mapFindingToVulnerabilityType(finding),
      severity: finding.severity,
      location: finding.pageUrl ?? defaultLocation,
      description: `${finding.title}. ${finding.summary}`.trim(),
      evidence: finding.evidence.join("; ") || finding.title,
      remediation: finding.remediation,
      confidence: this.mapConfidence(finding.confidence),
      exploitable: false
    };
  }

  private mapFindingToVulnerabilityType(finding: SecurityReviewFinding): string {
    const text = [
      finding.category,
      finding.title,
      finding.summary,
      finding.pageUrl ?? "",
      ...finding.evidence
    ]
      .join(" ")
      .toLowerCase();

    if (/(login|auth|credential|password|session)/.test(text)) {
      return "authentication";
    }
    if (/(authorization|access control|privilege|role|admin)/.test(text)) {
      return "authorization";
    }
    if (/(api|swagger|openapi|graphql|cors|json)/.test(text)) {
      return "api_security";
    }
    if (/(cookie|csrf|token)/.test(text)) {
      return "session_management";
    }
    if (finding.category === "headers" || finding.category === "cookies") {
      return "session_management";
    }
    if (finding.category === "forms") {
      return "authentication";
    }

    return finding.category;
  }

  private mapConfidence(confidence: "low" | "medium" | "high"): number {
    switch (confidence) {
      case "high":
        return 0.9;
      case "medium":
        return 0.7;
      default:
        return 0.5;
    }
  }

  private mergeVulnerabilities(vulnerabilities: Vulnerability[]): Vulnerability[] {
    const merged = new Map<string, Vulnerability>();
    for (const vulnerability of vulnerabilities) {
      const key = [
        vulnerability.type.toLowerCase(),
        vulnerability.location.toLowerCase(),
        vulnerability.description.toLowerCase()
      ].join("::");
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, vulnerability);
        continue;
      }

      if (
        this.compareSeverity(vulnerability.severity, existing.severity) > 0 ||
        (vulnerability.severity === existing.severity &&
          vulnerability.confidence > existing.confidence)
      ) {
        merged.set(key, vulnerability);
      }
    }

    return Array.from(merged.values()).sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });
  }

  private compareSeverity(
    left: Vulnerability["severity"],
    right: Vulnerability["severity"]
  ): number {
    const rank: Record<Vulnerability["severity"], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3
    };

    return rank[left] - rank[right];
  }

  private compareCheckStatus(
    left: SecurityReviewCheck["status"],
    right: SecurityReviewCheck["status"]
  ): number {
    const rank: Record<SecurityReviewCheck["status"], number> = {
      fail: 0,
      warn: 1,
      info: 2,
      pass: 3
    };

    return rank[left] - rank[right];
  }

  private deriveTechnologiesFromCheck(check: SecurityReviewCheck): string[] {
    return this.deriveTechnologiesFromText(
      `${check.name} ${check.observed} ${check.evidence.join(" ")}`
    );
  }

  private deriveTechnologiesFromFinding(finding: SecurityReviewFinding): string[] {
    return this.deriveTechnologiesFromText(
      [
        finding.title,
        finding.summary,
        finding.pageUrl ?? "",
        ...finding.evidence
      ].join(" ")
    );
  }

  private deriveTechnologiesFromText(text: string): string[] {
    const matches: string[] = [];
    const normalized = text.toLowerCase();

    if (/(graphql|graphiql|apollo)/.test(normalized)) {
      matches.push("GraphQL");
    }
    if (/(swagger|openapi|redoc)/.test(normalized)) {
      matches.push("OpenAPI/Swagger");
    }
    if (/(express)/.test(normalized)) {
      matches.push("Express");
    }
    if (/(nginx)/.test(normalized)) {
      matches.push("nginx");
    }
    if (/(apache)/.test(normalized)) {
      matches.push("Apache HTTP Server");
    }
    if (/(next\.js|nextjs)/.test(normalized)) {
      matches.push("Next.js");
    }
    if (/(wordpress)/.test(normalized)) {
      matches.push("WordPress");
    }
    if (/(prometheus|metrics)/.test(normalized)) {
      matches.push("Prometheus/Metrics");
    }

    return matches;
  }

  private extractRouteCandidates(text: string, baseUrl: string): string[] {
    const matches = [
      ...text.matchAll(/https?:\/\/[^\s"'<>]+/gi),
      ...text.matchAll(/\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+/g)
    ];

    return this.dedupeStrings(
      matches
        .map((match) => match[0].replace(/[),.;]+$/g, ""))
        .map((candidate) => this.normalizeEndpoint(candidate, baseUrl))
        .filter((candidate): candidate is string => Boolean(candidate))
    );
  }

  private normalizeTechnologyName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const normalized = trimmed
      .replace(/\/\d[\w.\-]*/g, "")
      .replace(/\s+\d[\w.\-]*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return normalized || trimmed;
  }

  private normalizeEndpoint(value: string, baseUrl: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return trimmed;
    }
  }

  private dedupeStrings(values: string[]): string[] {
    const unique = new Map<string, string>();
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, normalized);
      }
    }

    return Array.from(unique.values());
  }

  private isHighValueTarget(value: string): boolean {
    return /admin|login|auth|account|dashboard|console|api|graphql|swagger|openapi|redoc|metrics|health|debug|actuator|internal|config|backup|database|db|secret|env/i.test(
      value
    );
  }

  private normalizeTarget(target: string): string {
    const trimmed = target.trim();
    if (!trimmed) {
      throw new AppError("A target URL is required for reconnaissance.", 400);
    }

    const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(normalized);
    url.hash = "";
    return url.toString();
  }

  private normalizeMaxPages(value?: number): number {
    const numeric = Math.trunc(value ?? 4);
    return Math.max(1, Math.min(8, numeric));
  }

  private normalizeModelName(model: string): string {
    return model.trim().toLowerCase();
  }
}
