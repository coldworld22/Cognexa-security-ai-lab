import { randomUUID } from "crypto";

import type { Logger } from "pino";
import { z } from "zod";

import type { LLMService } from "../llm/llm.service";
import type {
  PenetrationTestAssuranceSummary,
  PenetrationTestContext,
  PenetrationTestEngagementMetadata,
  PenetrationTestManualFormValidationSummary,
  PenetrationTestReport,
  Vulnerability
} from "./penetration-test-orchestrator.service";
import { RemediationEngine } from "./remediation-engine.service";

const EXECUTIVE_SUMMARY_SCHEMA = z.object({
  executiveSummary: z.string().min(1).max(420)
});

const NARRATIVE_SCHEMA = z.object({
  narrative: z.string().min(1).max(1600)
});

const RECOMMENDATIONS_SCHEMA = z.object({
  recommendations: z.array(z.string().min(1).max(220)).min(1).max(8)
});

interface AiProviderSelection {
  provider: string;
  model: string;
}

export interface ReportGeneratorOptions {
  defaultProvider?: string;
  defaultModel?: string;
  now?: () => Date;
  passivePageLimit?: number;
  requestBudget?: number;
  authProfileNames?: string[];
  declaredAuthEndpoints?: number;
  guardrails?: string[];
  manualFormValidation?: Omit<
    PenetrationTestManualFormValidationSummary,
    "enabled"
  >;
  auditTrailEntries?: number;
}

export class ReportGenerator {
  private readonly defaultProvider?: string;
  private readonly defaultModel?: string;
  private readonly now: () => Date;
  private readonly passivePageLimit: number;
  private readonly requestBudget: number;
  private readonly authProfileNames: string[];
  private readonly declaredAuthEndpoints: number;
  private readonly guardrails: string[];
  private readonly manualFormValidation?: PenetrationTestManualFormValidationSummary;
  private readonly auditTrailEntries: number;
  private readonly remediationEngine = new RemediationEngine();

  private currentProviderSelection: AiProviderSelection | null = null;

  constructor(
    private readonly llm: LLMService,
    private readonly logger: Logger,
    options: ReportGeneratorOptions = {}
  ) {
    this.defaultProvider = options.defaultProvider?.trim() || undefined;
    this.defaultModel = options.defaultModel?.trim() || undefined;
    this.now = options.now ?? (() => new Date());
    this.passivePageLimit = Math.max(0, Math.trunc(options.passivePageLimit ?? 0));
    this.requestBudget = Math.max(0, Math.trunc(options.requestBudget ?? 0));
    this.authProfileNames = [...(options.authProfileNames ?? [])];
    this.declaredAuthEndpoints = Math.max(
      0,
      Math.trunc(options.declaredAuthEndpoints ?? 0)
    );
    this.guardrails =
      options.guardrails && options.guardrails.length > 0
        ? [...options.guardrails]
        : [
            "Execution remained inside an authorized read-only boundary.",
            "Validation stayed on the same origin as the approved target.",
            "No destructive or credential-submission actions were executed automatically."
          ];
    this.manualFormValidation =
      options.manualFormValidation &&
      options.manualFormValidation.credentialLabels.length > 0
        ? {
            enabled: true,
            rateLimitPerMinute: Math.max(
              1,
              Math.min(
                60,
                Math.trunc(
                  options.manualFormValidation.rateLimitPerMinute ?? 5
                )
              )
            ),
            credentialLabels: [
              ...options.manualFormValidation.credentialLabels
            ],
            ...(options.manualFormValidation.notes?.trim()
              ? {
                  notes: options.manualFormValidation.notes.trim()
                }
              : {})
          }
        : undefined;
    this.auditTrailEntries = Math.max(
      0,
      Math.trunc(options.auditTrailEntries ?? 0)
    );
  }

  async generateReport(
    context: PenetrationTestContext
  ): Promise<PenetrationTestReport> {
    const endTime = this.now();
    const sortedVulnerabilities = this.sortVulnerabilities(context.vulnerabilities);
    this.currentProviderSelection = await this.selectAiProviderAndModel();

    this.logger.info(
      {
        target: context.target,
        vulnerabilityCount: sortedVulnerabilities.length,
        attackChains: context.attackChains.length,
        executionResults: context.executionResults.length
      },
      "Report generator started"
    );

    try {
      const [executiveSummary, narrative, recommendations, impact] = await Promise.all([
        this.generateExecutiveSummary(context),
        this.generateNarrative(context),
        this.generateRecommendations(sortedVulnerabilities),
        this.calculateImpact(sortedVulnerabilities)
      ]);
      const engagement = this.buildEngagementMetadata(context);
      const assurance = this.buildAssuranceSummary(context);
      const remediationPlan = this.remediationEngine.buildPlan(
        sortedVulnerabilities,
        context.attackChains
      );

      const report: PenetrationTestReport = {
        id: randomUUID(),
        target: context.target,
        startTime: context.startTime,
        endTime,
        duration: Math.max(0, endTime.getTime() - context.startTime.getTime()),
        executiveSummary,
        narrative,
        engagement,
        assurance,
        remediationPlan,
        vulnerabilities: this.cloneSerializable(sortedVulnerabilities),
        attackChains: this.cloneSerializable(context.attackChains),
        impact,
        recommendations,
        evidence: this.cloneSerializable(context.evidence),
        rawData: {
          generatedAt: endTime.toISOString(),
          context: this.cloneSerializable(context),
          stats: {
            vulnerabilityCount: sortedVulnerabilities.length,
            confirmedFindings: context.executionResults.filter((result) => result.success).length,
            chainCount: context.attackChains.length,
            evidenceCount: context.evidence.length,
            decisionCount: context.decisions.length
          }
        }
      };

      this.logger.info(
        {
          reportId: report.id,
          target: report.target,
          recommendations: report.recommendations.length
        },
        "Report generator completed"
      );

      return report;
    } catch (error) {
      this.logger.error(
        {
          error,
          target: context.target
        },
        "Report generator failed"
      );
      throw error;
    } finally {
      this.currentProviderSelection = null;
    }
  }

  private async generateNarrative(context: PenetrationTestContext): Promise<string> {
    const providerSelection = this.currentProviderSelection;
    if (!providerSelection) {
      return this.buildDeterministicNarrative(context);
    }

    try {
      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "Write a professional attacker-perspective narrative for an authorized white-hat penetration test. Keep the tone defensive and factual. Explain progression from entry to impact using only the provided evidence. Do not include exploit payloads, intrusion steps, bypass guidance, or destructive instructions."
            },
            {
              role: "user",
              content: JSON.stringify(this.buildNarrativePrompt(context))
            }
          ]
        },
        NARRATIVE_SCHEMA
      );

      return response.narrative.trim();
    } catch (error) {
      this.logger.warn(
        {
          error,
          target: context.target
        },
        "AI narrative generation failed, using deterministic narrative"
      );
      return this.buildDeterministicNarrative(context);
    }
  }

  private async generateExecutiveSummary(
    context: PenetrationTestContext
  ): Promise<string> {
    const providerSelection = this.currentProviderSelection;
    if (!providerSelection) {
      return this.buildDeterministicExecutiveSummary(context);
    }

    try {
      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "Write an executive summary for an authorized white-hat penetration test. Keep it concise, defensive, and suitable for security leadership. Summarize scope, key risk, and the most important remediation priority without exploit detail."
            },
            {
              role: "user",
              content: JSON.stringify(this.buildExecutiveSummaryPrompt(context))
            }
          ]
        },
        EXECUTIVE_SUMMARY_SCHEMA
      );

      return response.executiveSummary.trim();
    } catch (error) {
      this.logger.warn(
        {
          error,
          target: context.target
        },
        "AI executive summary generation failed, using deterministic summary"
      );
      return this.buildDeterministicExecutiveSummary(context);
    }
  }

  private async generateRecommendations(
    vulnerabilities: Vulnerability[]
  ): Promise<string[]> {
    const fallbackRecommendations = this.buildDeterministicRecommendations(vulnerabilities);
    const providerSelection = this.currentProviderSelection;
    if (!providerSelection) {
      return fallbackRecommendations;
    }

    try {
      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "Create prioritized defensive recommendations for an authorized white-hat penetration test. Focus on remediation and safe validation. Keep each recommendation concise, actionable, and non-destructive."
            },
            {
              role: "user",
              content: JSON.stringify({
                vulnerabilities: vulnerabilities.map((vulnerability) => ({
                  type: vulnerability.type,
                  severity: vulnerability.severity,
                  location: vulnerability.location,
                  description: vulnerability.description,
                  remediation: vulnerability.remediation,
                  exploitable: vulnerability.exploitable
                }))
              })
            }
          ]
        },
        RECOMMENDATIONS_SCHEMA
      );

      return this.uniqueStrings([
        ...response.recommendations,
        ...fallbackRecommendations
      ]).slice(0, 8);
    } catch (error) {
      this.logger.warn(
        {
          error,
          vulnerabilityCount: vulnerabilities.length
        },
        "AI recommendation generation failed, using deterministic recommendations"
      );
      return fallbackRecommendations;
    }
  }

  private async calculateImpact(vulnerabilities: Vulnerability[]): Promise<string> {
    const highestSeverity = this.sortVulnerabilities(vulnerabilities)[0]?.severity ?? "low";
    const hasAuthentication = vulnerabilities.some(
      (vulnerability) => vulnerability.type === "authentication" && vulnerability.exploitable
    );
    const hasAuthorization = vulnerabilities.some(
      (vulnerability) => vulnerability.type === "authorization" && vulnerability.exploitable
    );
    const hasApiExposure = vulnerabilities.some(
      (vulnerability) => vulnerability.type === "api_security" && vulnerability.exploitable
    );

    if (highestSeverity === "critical" || (hasAuthentication && hasAuthorization)) {
      return "The confirmed attack path creates a critical privilege or data-exposure risk that should be remediated immediately.";
    }

    if (highestSeverity === "high" || (hasApiExposure && (hasAuthentication || hasAuthorization))) {
      return "The confirmed findings materially weaken application trust boundaries and should be remediated on the next urgent fix cycle.";
    }

    if (highestSeverity === "medium") {
      return "The findings increase attacker leverage and should be remediated before adjacent weaknesses make them easier to chain.";
    }

    return "The current findings are lower-risk individually, but they still expand attacker understanding of the target.";
  }

  private buildNarrativePrompt(context: PenetrationTestContext) {
    return {
      target: context.target,
      phase: context.currentPhase,
      reconSummary: context.reconData
        ? {
            headline: context.reconData.summary?.headline,
            riskLevel: context.reconData.summary?.riskLevel,
            priority: context.reconData.priority
          }
        : null,
      attackPlan: {
        priority: context.attackPlan.priority,
        estimatedSuccess: context.attackPlan.estimatedSuccess,
        attacks: context.attackPlan.attacks.map((attack) => ({
          name: attack.name,
          type: attack.type,
          status: attack.status,
          result: attack.result
        }))
      },
      vulnerabilities: this.sortVulnerabilities(context.vulnerabilities).map((vulnerability) => ({
        id: vulnerability.id,
        type: vulnerability.type,
        severity: vulnerability.severity,
        location: vulnerability.location,
        description: vulnerability.description,
        evidence: vulnerability.evidence,
        exploitable: vulnerability.exploitable
      })),
      attackChains: context.attackChains,
      decisions: context.decisions.map((decision) => ({
        action: decision.action,
        reason: decision.reason,
        confidence: decision.confidence
      }))
    };
  }

  private buildExecutiveSummaryPrompt(context: PenetrationTestContext) {
    const sortedVulnerabilities = this.sortVulnerabilities(context.vulnerabilities);
    return {
      target: context.target,
      totalVulnerabilities: sortedVulnerabilities.length,
      highestSeverity: sortedVulnerabilities[0]?.severity ?? "low",
      successfulAttacks: context.executionResults.filter((result) => result.success).length,
      attackChains: context.attackChains.length,
      topFindings: sortedVulnerabilities.slice(0, 4).map((vulnerability) => ({
        type: vulnerability.type,
        severity: vulnerability.severity,
        location: vulnerability.location,
        description: vulnerability.description
      }))
    };
  }

  private buildDeterministicExecutiveSummary(
    context: PenetrationTestContext
  ): string {
    const sortedVulnerabilities = this.sortVulnerabilities(context.vulnerabilities);
    const highestSeverity = sortedVulnerabilities[0]?.severity ?? "low";
    const successfulAttacks = context.executionResults.filter((result) => result.success).length;
    const topSurface = sortedVulnerabilities[0]
      ? `${sortedVulnerabilities[0].type} at ${sortedVulnerabilities[0].location}`
      : "the reviewed target surface";

    return `The authorized read-only penetration test against ${context.target} identified ${sortedVulnerabilities.length} vulnerability signal(s) and confirmed ${successfulAttacks} guarded validation path(s). The most important risk is ${highestSeverity}-severity exposure around ${topSurface}, and remediation should prioritize restoring the affected trust boundary before adjacent weaknesses can be chained.`;
  }

  private buildDeterministicNarrative(context: PenetrationTestContext): string {
    const firstChain = context.attackChains[0];
    if (firstChain) {
      const story = firstChain.steps
        .map((step) => `Step ${step.step}: ${step.action} ${step.result}`)
        .join(" ");
      return `The engagement stayed inside an authorized read-only boundary and progressed through a validated attack story. ${story} This chain illustrates how the attacker-facing entry point led to confirmed impact on the same application trust boundary.`;
    }

    const successfulResults = context.executionResults
      .filter((result) => result.success)
      .map((result) => `${result.attackName}: ${result.message}`)
      .slice(0, 4);
    if (successfulResults.length > 0) {
      return `The engagement stayed inside an authorized read-only boundary and moved from reconnaissance into guarded active validation. The strongest validated signals were ${successfulResults.join(" | ")}, which together show how publicly observable surface area translated into confirmed security impact.`;
    }

    return "The orchestrated penetration test remained within a strict read-only boundary and documented the available attack surface, guarded validation outcomes, and resulting defensive priorities without escalating into destructive or out-of-scope actions.";
  }

  private buildDeterministicRecommendations(
    vulnerabilities: Vulnerability[]
  ): string[] {
    const sorted = this.sortVulnerabilities(vulnerabilities);
    const recommendations = this.uniqueStrings(
      sorted.map((vulnerability) => vulnerability.remediation)
    );

    if (sorted.some((vulnerability) => vulnerability.type === "authentication")) {
      recommendations.unshift(
        "Require authentication before privileged routes, administrative pages, and sensitive workflows render any protected content."
      );
    }
    if (sorted.some((vulnerability) => vulnerability.type === "authorization")) {
      recommendations.unshift(
        "Enforce role-based authorization checks consistently on privileged routes and API handlers."
      );
    }
    if (sorted.some((vulnerability) => vulnerability.type === "api_security")) {
      recommendations.unshift(
        "Reduce public API discovery surface and ensure sensitive endpoints return only least-privilege data."
      );
    }

    return this.uniqueStrings(recommendations).slice(0, 8);
  }

  private buildEngagementMetadata(
    context: PenetrationTestContext
  ): PenetrationTestEngagementMetadata {
    const targetUrl = new URL(context.target);

    return {
      targetOrigin: targetUrl.origin,
      verificationId: context.verificationId,
      passivePageLimit: this.passivePageLimit,
      requestBudget: this.requestBudget,
      authProfiles: [...this.authProfileNames],
      declaredAuthEndpoints: this.declaredAuthEndpoints,
      guardrails: [...this.guardrails],
      manualFormValidation: this.manualFormValidation
    };
  }

  private buildAssuranceSummary(
    context: PenetrationTestContext
  ): PenetrationTestAssuranceSummary {
    return {
      readOnlyOnly: true,
      sameOriginOnly: true,
      auditTrailEntries: this.auditTrailEntries,
      evidenceItems: context.evidence.length,
      decisions: context.decisions.length,
      successfulValidations: context.executionResults.filter(
        (result) => result.success
      ).length,
      attackChainCount: context.attackChains.length
    };
  }

  private sortVulnerabilities(vulnerabilities: Vulnerability[]): Vulnerability[] {
    return [...vulnerabilities].sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });
  }

  private async selectAiProviderAndModel(): Promise<AiProviderSelection | null> {
    try {
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
    } catch (error) {
      this.logger.warn({ error }, "Failed to list LLM providers for report generation");
      return null;
    }
  }

  private normalizeModelName(model: string): string {
    return model.trim().toLowerCase();
  }

  private uniqueStrings(values: string[]): string[] {
    const unique = new Map<string, string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const key = trimmed.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, trimmed);
      }
    }

    return Array.from(unique.values());
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

  private cloneSerializable<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
