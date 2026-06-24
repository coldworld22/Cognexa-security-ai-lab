import { randomUUID } from "crypto";

import type { Logger } from "pino";
import { z } from "zod";

import type { LLMService } from "../llm/llm.service";
import type {
  AttackChain,
  Vulnerability
} from "./penetration-test-orchestrator.service";

const CHAIN_OUTPUT_SCHEMA = z.object({
  chains: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        businessImpact: z.string().min(1).max(320),
        steps: z
          .array(
            z.object({
              vulnerabilityId: z.string().min(1).max(120),
              action: z.string().min(1).max(220),
              result: z.string().min(1).max(240),
              evidence: z.string().min(1).max(240),
              nextStep: z.string().min(1).max(220)
            })
          )
          .min(2)
          .max(5)
      })
    )
    .max(4)
});

interface AiProviderSelection {
  provider: string;
  model: string;
}

export class ChainBuilder {
  private vulnerabilityMap = new Map<string, Vulnerability>();

  constructor(
    private readonly llm: LLMService,
    private readonly logger: Logger
  ) {}

  async buildChains(vulnerabilities: Vulnerability[]): Promise<AttackChain[]> {
    const normalizedVulnerabilities = this.normalizeVulnerabilities(vulnerabilities);
    this.vulnerabilityMap = new Map(
      normalizedVulnerabilities.map((vulnerability) => [vulnerability.id, vulnerability] as const)
    );

    this.logger.info(
      {
        vulnerabilityCount: normalizedVulnerabilities.length
      },
      "Chain builder started"
    );

    if (normalizedVulnerabilities.length < 2) {
      this.logger.info(
        {
          vulnerabilityCount: normalizedVulnerabilities.length
        },
        "Chain builder skipped because fewer than two vulnerabilities were available"
      );
      return [];
    }

    try {
      const aiChains = await this.generateChainsWithAI(normalizedVulnerabilities);
      if (aiChains.length > 0) {
        this.logger.info(
          {
            chainCount: aiChains.length,
            source: "ai"
          },
          "Chain builder completed"
        );
        return aiChains;
      }
    } catch (error) {
      this.logger.warn(
        {
          error,
          vulnerabilityCount: normalizedVulnerabilities.length
        },
        "AI chain generation failed, using heuristic chains"
      );
    }

    const heuristicChains = this.buildHeuristicChains(normalizedVulnerabilities);
    this.logger.info(
      {
        chainCount: heuristicChains.length,
        source: "heuristic"
      },
      "Chain builder completed"
    );
    return heuristicChains;
  }

  private async generateChainsWithAI(
    vulnerabilities: Vulnerability[]
  ): Promise<AttackChain[]> {
    const providerSelection = await this.selectAiProviderAndModel();
    if (!providerSelection) {
      return [];
    }

    const output = await this.llm.createStructuredOutput(
      providerSelection.provider,
      {
        model: providerSelection.model,
        messages: [
          {
            role: "system",
            content:
              "You are a defensive attack-chain analyst for an authorized white-hat penetration test. Use only the provided validated vulnerabilities. Show plausible progression from entry to impact, but do not invent exploit payloads, step-by-step intrusion guidance, bypass details, or destructive actions. Return concise, evidence-grounded chain narratives only."
          },
          {
            role: "user",
            content: JSON.stringify({
              vulnerabilities: vulnerabilities.map((vulnerability) => ({
                id: vulnerability.id,
                type: vulnerability.type,
                severity: vulnerability.severity,
                location: vulnerability.location,
                description: vulnerability.description,
                evidence: vulnerability.evidence,
                confidence: vulnerability.confidence,
                exploitable: vulnerability.exploitable,
                remediation: vulnerability.remediation
              }))
            })
          }
        ]
      },
      CHAIN_OUTPUT_SCHEMA
    );

    const mappedChains = output.chains
      .map((chain) => {
        const vulnerabilityIds = chain.steps.map((step) => step.vulnerabilityId);
        const mapped: AttackChain = {
          id: randomUUID(),
          name: chain.name,
          impact: this.calculateImpact(vulnerabilityIds),
          effort: this.calculateEffort(vulnerabilityIds),
          businessImpact: chain.businessImpact,
          steps: chain.steps.map((step, index) => ({
            step: index + 1,
            vulnerability: step.vulnerabilityId,
            action: step.action,
            result: step.result,
            evidence: step.evidence,
            nextStep: step.nextStep
          }))
        };

        return this.validateChain(mapped) ? mapped : null;
      })
      .filter((chain): chain is AttackChain => Boolean(chain));

    return this.dedupeChains(mappedChains);
  }

  private validateChain(chain: AttackChain): boolean {
    if (!chain.name.trim() || !chain.businessImpact.trim()) {
      return false;
    }

    if (chain.steps.length < 2 || chain.steps.length > 5) {
      return false;
    }

    const vulnerabilityIds = chain.steps.map((step) => step.vulnerability);
    const uniqueVulnerabilityIds = new Set(vulnerabilityIds);
    if (uniqueVulnerabilityIds.size !== vulnerabilityIds.length) {
      return false;
    }

    for (let index = 0; index < chain.steps.length; index += 1) {
      const step = chain.steps[index];
      if (!step) {
        return false;
      }

      if (step.step !== index + 1) {
        return false;
      }

      if (!this.vulnerabilityMap.has(step.vulnerability)) {
        return false;
      }

      if (
        !step.action.trim() ||
        !step.result.trim() ||
        !step.evidence.trim() ||
        !step.nextStep.trim()
      ) {
        return false;
      }
    }

    const chainVulnerabilities = vulnerabilityIds
      .map((id) => this.vulnerabilityMap.get(id))
      .filter((vulnerability): vulnerability is Vulnerability => Boolean(vulnerability));
    if (chainVulnerabilities.length < 2) {
      return false;
    }

    const hasMeaningfulImpact = chainVulnerabilities.some(
      (vulnerability) =>
        vulnerability.exploitable ||
        vulnerability.severity === "critical" ||
        vulnerability.severity === "high"
    );
    if (!hasMeaningfulImpact) {
      return false;
    }

    return (
      chain.impact === this.calculateImpact(vulnerabilityIds) &&
      chain.effort === this.calculateEffort(vulnerabilityIds)
    );
  }

  private calculateImpact(
    vulnerabilities: string[]
  ): "critical" | "high" | "medium" | "low" {
    const chainVulnerabilities = vulnerabilities
      .map((id) => this.vulnerabilityMap.get(id))
      .filter((vulnerability): vulnerability is Vulnerability => Boolean(vulnerability));
    if (chainVulnerabilities.length === 0) {
      return "low";
    }

    const hasCritical = chainVulnerabilities.some(
      (vulnerability) => vulnerability.severity === "critical"
    );
    const hasHigh = chainVulnerabilities.some(
      (vulnerability) => vulnerability.severity === "high"
    );
    const authentication = chainVulnerabilities.find(
      (vulnerability) => vulnerability.type === "authentication" && vulnerability.exploitable
    );
    const authorization = chainVulnerabilities.find(
      (vulnerability) => vulnerability.type === "authorization" && vulnerability.exploitable
    );
    const apiExposure = chainVulnerabilities.find(
      (vulnerability) => vulnerability.type === "api_security"
    );
    const exploitableCount = chainVulnerabilities.filter(
      (vulnerability) => vulnerability.exploitable
    ).length;

    if (hasCritical || (authentication && authorization)) {
      return "critical";
    }

    if (
      hasHigh ||
      exploitableCount >= 2 ||
      (apiExposure && (authentication || authorization))
    ) {
      return "high";
    }

    if (
      chainVulnerabilities.some((vulnerability) => vulnerability.severity === "medium") ||
      chainVulnerabilities.length >= 3
    ) {
      return "medium";
    }

    return "low";
  }

  private calculateEffort(
    vulnerabilities: string[]
  ): "easy" | "medium" | "hard" {
    const chainVulnerabilities = vulnerabilities
      .map((id) => this.vulnerabilityMap.get(id))
      .filter((vulnerability): vulnerability is Vulnerability => Boolean(vulnerability));
    if (chainVulnerabilities.length === 0) {
      return "hard";
    }

    const hasPassiveEntry = chainVulnerabilities.some(
      (vulnerability) => !vulnerability.exploitable
    );
    const hasAccessControlCombo =
      chainVulnerabilities.some(
        (vulnerability) => vulnerability.type === "authentication" && vulnerability.exploitable
      ) &&
      chainVulnerabilities.some(
        (vulnerability) => vulnerability.type === "authorization" && vulnerability.exploitable
      );
    const hasComplexType = chainVulnerabilities.some((vulnerability) =>
      ["sql_injection", "xss", "waf"].includes(vulnerability.type)
    );
    const lowConfidenceCount = chainVulnerabilities.filter(
      (vulnerability) => vulnerability.confidence < 0.6
    ).length;

    if (
      hasAccessControlCombo &&
      (hasPassiveEntry || chainVulnerabilities.length <= 3) &&
      lowConfidenceCount === 0
    ) {
      return "easy";
    }

    if (chainVulnerabilities.length >= 4 || (hasComplexType && lowConfidenceCount > 0)) {
      return "hard";
    }

    if (hasComplexType || chainVulnerabilities.length >= 3 || lowConfidenceCount > 0) {
      return "medium";
    }

    return "easy";
  }

  private buildHeuristicChains(vulnerabilities: Vulnerability[]): AttackChain[] {
    const chains: AttackChain[] = [];
    const passiveAdminSurface = vulnerabilities.find(
      (vulnerability) =>
        vulnerability.exploitable === false &&
        /(admin|privileged|protected)/i.test(
          `${vulnerability.location} ${vulnerability.description}`
        )
    );
    const authentication = vulnerabilities.find(
      (vulnerability) => vulnerability.type === "authentication" && vulnerability.exploitable
    );
    const authorization = vulnerabilities.find(
      (vulnerability) => vulnerability.type === "authorization" && vulnerability.exploitable
    );
    const apiExposure = vulnerabilities.find(
      (vulnerability) => vulnerability.type === "api_security" && vulnerability.exploitable
    );

    if (passiveAdminSurface && authentication && authorization) {
      chains.push(
        this.createChain(
          "Privilege boundary failure chain",
          "A public attacker can discover privileged routes, confirm missing authentication pressure, and then demonstrate missing authorization separation.",
          [
            {
              vulnerability: passiveAdminSurface.id,
              action: "Use passive reconnaissance to locate privileged-looking application routes.",
              result: passiveAdminSurface.description,
              evidence: passiveAdminSurface.evidence,
              nextStep: "Validate whether the routes challenge anonymous access."
            },
            {
              vulnerability: authentication.id,
              action: "Run read-only authentication validation against the exposed route.",
              result: authentication.description,
              evidence: authentication.evidence,
              nextStep: "Compare lower-trust and higher-trust responses."
            },
            {
              vulnerability: authorization.id,
              action: "Run differential authorization checks across approved profiles.",
              result: authorization.description,
              evidence: authorization.evidence,
              nextStep: "Report the privilege-boundary failure and remediation path."
            }
          ]
        )
      );
    }

    if (apiExposure && authentication) {
      chains.push(
        this.createChain(
          "API exposure to access-control validation chain",
          "Exposed API surface shortens attacker discovery time and increases the chance of unauthorized data access if route protection is weak.",
          [
            {
              vulnerability: apiExposure.id,
              action: "Identify exposed API surface through passive or guarded active discovery.",
              result: apiExposure.description,
              evidence: apiExposure.evidence,
              nextStep: "Validate whether the exposed surface enforces authentication."
            },
            {
              vulnerability: authentication.id,
              action: "Confirm authentication behavior against the exposed API surface.",
              result: authentication.description,
              evidence: authentication.evidence,
              nextStep: "Prioritize remediation around API access controls."
            }
          ]
        )
      );
    }

    if (chains.length === 0 && authentication && authorization) {
      chains.push(
        this.createChain(
          "Confirmed access-control chain",
          "The target failed both authentication and authorization validation on a related privileged surface, creating a coherent path to unauthorized access.",
          [
            {
              vulnerability: authentication.id,
              action: "Validate whether the privileged surface enforces authentication.",
              result: authentication.description,
              evidence: authentication.evidence,
              nextStep: "Compare how lower-trust and higher-trust identities are handled."
            },
            {
              vulnerability: authorization.id,
              action: "Run differential authorization checks across approved profiles.",
              result: authorization.description,
              evidence: authorization.evidence,
              nextStep: "Report the confirmed access-control chain and remediation path."
            }
          ]
        )
      );
    }

    if (chains.length === 0) {
      const sorted = [...vulnerabilities].sort((left, right) => {
        const severityDelta = this.compareSeverity(right.severity, left.severity);
        if (severityDelta !== 0) {
          return severityDelta;
        }

        return right.confidence - left.confidence;
      });
      const entry = sorted.find(
        (vulnerability) =>
          !vulnerability.exploitable ||
          /(login|admin|api|graphql|swagger|auth|account)/i.test(
            `${vulnerability.location} ${vulnerability.description}`
          )
      );
      const impact = sorted.find(
        (vulnerability) =>
          vulnerability.exploitable && vulnerability.id !== entry?.id
      );

      if (entry && impact) {
        chains.push(
          this.createChain(
            "Reconnaissance to validated impact chain",
            "The identified surface provides a plausible path from discovery to a confirmed security impact that should be remediated as a sequence rather than isolated issues.",
            [
              {
                vulnerability: entry.id,
                action: "Use the discovered surface as the entry point for focused validation.",
                result: entry.description,
                evidence: entry.evidence,
                nextStep: "Validate whether the same surface leads to a stronger impact."
              },
              {
                vulnerability: impact.id,
                action: "Confirm the higher-impact weakness on the related surface.",
                result: impact.description,
                evidence: impact.evidence,
                nextStep: "Report the progression from entry to impact and prioritize remediation."
              }
            ]
          )
        );
      }
    }

    return this.dedupeChains(
      chains.filter((chain) => this.validateChain(chain))
    );
  }

  private createChain(
    name: string,
    businessImpact: string,
    steps: Array<Omit<AttackChain["steps"][number], "step">>
  ): AttackChain {
    const vulnerabilityIds = steps.map((step) => step.vulnerability);
    return {
      id: randomUUID(),
      name,
      impact: this.calculateImpact(vulnerabilityIds),
      effort: this.calculateEffort(vulnerabilityIds),
      businessImpact,
      steps: steps.map((step, index) => ({
        step: index + 1,
        ...step
      }))
    };
  }

  private async selectAiProviderAndModel(): Promise<AiProviderSelection | null> {
    try {
      const providers = await this.llm.listProviders();
      const availableProviders = providers.filter((provider) => provider.models.length > 0);
      if (availableProviders.length === 0) {
        return null;
      }

      const provider = availableProviders[0];
      const model = provider?.models[0];
      if (!provider || !model) {
        return null;
      }

      return {
        provider: provider.id,
        model
      };
    } catch (error) {
      this.logger.warn({ error }, "Failed to list LLM providers for chain builder");
      return null;
    }
  }

  private normalizeVulnerabilities(vulnerabilities: Vulnerability[]): Vulnerability[] {
    const unique = new Map<string, Vulnerability>();
    for (const vulnerability of vulnerabilities) {
      if (!vulnerability.id.trim()) {
        continue;
      }

      const existing = unique.get(vulnerability.id);
      if (!existing) {
        unique.set(vulnerability.id, vulnerability);
        continue;
      }

      if (
        this.compareSeverity(vulnerability.severity, existing.severity) > 0 ||
        (vulnerability.severity === existing.severity &&
          vulnerability.confidence > existing.confidence)
      ) {
        unique.set(vulnerability.id, vulnerability);
      }
    }

    return Array.from(unique.values());
  }

  private dedupeChains(chains: AttackChain[]): AttackChain[] {
    const unique = new Map<string, AttackChain>();
    for (const chain of chains) {
      const key = chain.steps.map((step) => step.vulnerability).join("::");
      if (!unique.has(key)) {
        unique.set(key, chain);
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
}
