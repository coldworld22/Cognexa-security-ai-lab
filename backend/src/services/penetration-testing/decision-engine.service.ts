import { randomUUID } from "crypto";

import type { Logger } from "pino";
import { z } from "zod";

import { AUTHORIZED_SECURITY_TEST_MODULES } from "../authorized-testing/authorized-security-testing.types";
import type { LLMService } from "../llm/llm.service";
import type {
  Attack,
  AttackResult,
  Decision,
  PenetrationTestContext,
  Vulnerability
} from "./penetration-test-orchestrator.service";

const DECISION_OUTPUT_SCHEMA = z.object({
  action: z.string().min(1).max(180),
  reason: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
  alternative: z.string().min(1).max(180)
});

const EVALUATION_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
  insights: z.array(z.string().min(1).max(220)).min(1).max(6),
  nextStep: z.string().min(1).max(220),
  canEscalate: z.boolean(),
  confidence: z.number().min(0).max(1)
});

const ATTACK_OUTPUT_SCHEMA = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(AUTHORIZED_SECURITY_TEST_MODULES),
  target: z.string().min(1).max(240),
  payload: z.string().min(1).max(280),
  expectedOutcome: z.string().min(1).max(240)
});

const RISKY_ATTACK_TERMS = [
  "post",
  "put",
  "patch",
  "delete",
  "upload",
  "write",
  "modify",
  "destroy",
  "drop",
  "truncate",
  "insert",
  "update",
  "exfiltrate",
  "brute force",
  "credential stuffing",
  "persistence",
  "reverse shell"
];

export interface Evaluation {
  success: boolean;
  insights: string[];
  nextStep: string;
  canEscalate: boolean;
  confidence: number;
}

interface AiProviderSelection {
  provider: string;
  model: string;
}

export class DecisionEngine {
  constructor(
    private readonly llm: LLMService,
    private readonly logger: Logger
  ) {}

  async decideNextAction(
    context: PenetrationTestContext,
    availableActions: string[]
  ): Promise<Decision> {
    const normalizedActions = this.uniqueStrings(availableActions).slice(0, 12);
    const fallbackDecision = this.buildHeuristicDecision(context, normalizedActions);

    this.logger.info(
      {
        phase: context.currentPhase,
        target: context.target,
        availableActions: normalizedActions
      },
      "Decision engine evaluating next action"
    );

    try {
      const providerSelection = await this.selectAiProviderAndModel();
      if (!providerSelection) {
        return this.createDecision(fallbackDecision);
      }

      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are coordinating an authorized white-hat penetration test within strict read-only boundaries. Choose exactly one next action from the provided list. Optimize for evidence quality, safety, and attack-chain value. Do not suggest destructive or out-of-scope actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                availableActions: normalizedActions,
                context: this.summarizeContext(context)
              })
            }
          ]
        },
        DECISION_OUTPUT_SCHEMA
      );

      const action = this.resolveAvailableAction(response.action, normalizedActions);
      if (!action) {
        this.logger.warn(
          {
            phase: context.currentPhase,
            proposedAction: response.action,
            availableActions: normalizedActions
          },
          "AI decision did not match available actions, using heuristic decision"
        );
        return this.createDecision(fallbackDecision);
      }

      return this.createDecision({
        action,
        reason: response.reason.trim(),
        confidence: this.clampConfidence(response.confidence),
        alternative: this.resolveAlternativeAction(
          response.alternative,
          action,
          normalizedActions
        )
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          phase: context.currentPhase,
          target: context.target
        },
        "Decision engine AI next-action selection failed, using heuristic decision"
      );
      return this.createDecision(fallbackDecision);
    }
  }

  async evaluateResult(
    attack: Attack,
    result: AttackResult
  ): Promise<Evaluation> {
    const fallbackEvaluation = this.buildHeuristicEvaluation(attack, result);

    this.logger.info(
      {
        attackId: attack.id,
        attackType: attack.type,
        success: result.success
      },
      "Decision engine evaluating attack result"
    );

    try {
      const providerSelection = await this.selectAiProviderAndModel();
      if (!providerSelection) {
        return fallbackEvaluation;
      }

      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are evaluating the outcome of an authorized read-only penetration-test action. Determine whether the result meaningfully advanced the assessment, what was learned, the safest next step, and whether adjacent read-only validation can be escalated within scope. Do not recommend destructive or exploitative actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                attack: this.summarizeAttack(attack),
                result: this.summarizeAttackResult(result)
              })
            }
          ]
        },
        EVALUATION_OUTPUT_SCHEMA
      );

      return {
        success: response.success,
        insights: this.uniqueStrings(response.insights).slice(0, 6),
        nextStep: response.nextStep.trim(),
        canEscalate: response.canEscalate,
        confidence: this.clampConfidence(response.confidence)
      };
    } catch (error) {
      this.logger.warn(
        {
          error,
          attackId: attack.id,
          attackType: attack.type
        },
        "Decision engine AI result evaluation failed, using heuristic evaluation"
      );
      return fallbackEvaluation;
    }
  }

  async suggestAlternative(
    failedAttack: Attack,
    context: PenetrationTestContext
  ): Promise<Attack> {
    const fallbackAlternative = this.buildHeuristicAlternative(failedAttack, context);

    this.logger.info(
      {
        attackId: failedAttack.id,
        attackType: failedAttack.type,
        target: failedAttack.target
      },
      "Decision engine suggesting alternative attack"
    );

    try {
      const providerSelection = await this.selectAiProviderAndModel();
      if (!providerSelection) {
        return fallbackAlternative;
      }

      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are proposing an alternative step for an authorized white-hat penetration test. The alternative must stay read-only, same-origin, and safe. Use only GET, HEAD, or OPTIONS style validation concepts. Keep payloads abstract and non-destructive. Prefer a different surface or validation angle than the failed attack."
            },
            {
              role: "user",
              content: JSON.stringify({
                failedAttack: this.summarizeAttack(failedAttack),
                context: this.summarizeContext(context),
                candidateTargets: this.buildCandidateTargets(context),
                candidateModules: AUTHORIZED_SECURITY_TEST_MODULES
              })
            }
          ]
        },
        ATTACK_OUTPUT_SCHEMA
      );

      const alternative = this.sanitizeAlternativeAttack(response, failedAttack, context);
      if (!this.isDistinctAlternative(alternative, failedAttack)) {
        this.logger.warn(
          {
            attackId: failedAttack.id,
            proposedType: alternative.type,
            proposedTarget: alternative.target
          },
          "AI alternative was not sufficiently distinct, using heuristic alternative"
        );
        return fallbackAlternative;
      }

      return alternative;
    } catch (error) {
      this.logger.warn(
        {
          error,
          attackId: failedAttack.id,
          attackType: failedAttack.type
        },
        "Decision engine AI alternative generation failed, using heuristic alternative"
      );
      return fallbackAlternative;
    }
  }

  private async selectAiProviderAndModel(): Promise<AiProviderSelection | null> {
    try {
      const providers = await this.llm.listProviders();
      const availableProviders = providers.filter((provider) => provider.models.length > 0);
      if (availableProviders.length === 0) {
        return null;
      }

      const selectedProvider = availableProviders[0];
      const selectedModel = selectedProvider?.models[0];
      if (!selectedProvider || !selectedModel) {
        return null;
      }

      return {
        provider: selectedProvider.id,
        model: selectedModel
      };
    } catch (error) {
      this.logger.warn({ error }, "Failed to list LLM providers for decision engine");
      return null;
    }
  }

  private createDecision(
    input: Omit<Decision, "id" | "timestamp">
  ): Decision {
    return {
      id: randomUUID(),
      action: input.action,
      reason: input.reason,
      confidence: this.clampConfidence(input.confidence),
      alternative: input.alternative,
      timestamp: new Date()
    };
  }

  private summarizeContext(context: PenetrationTestContext) {
    return {
      target: context.target,
      verificationId: context.verificationId,
      currentPhase: context.currentPhase,
      startedAt: context.startTime.toISOString(),
      isComplete: context.isComplete,
      reconSummary: context.reconData
        ? {
            headline:
              typeof context.reconData.summary?.headline === "string"
                ? context.reconData.summary.headline
                : undefined,
            riskLevel:
              typeof context.reconData.summary?.riskLevel === "string"
                ? context.reconData.summary.riskLevel
                : undefined,
            priority:
              typeof context.reconData.priority === "string"
                ? context.reconData.priority
                : undefined
          }
        : null,
      vulnerabilities: context.vulnerabilities.slice(0, 10).map((vulnerability) => ({
        id: vulnerability.id,
        type: vulnerability.type,
        severity: vulnerability.severity,
        location: vulnerability.location,
        description: vulnerability.description,
        confidence: vulnerability.confidence,
        exploitable: vulnerability.exploitable
      })),
      pendingAttacks: context.attackPlan.attacks
        .filter((attack) => attack.status === "pending")
        .slice(0, 8)
        .map((attack) => ({
          id: attack.id,
          name: attack.name,
          type: attack.type,
          target: attack.target,
          expectedOutcome: attack.expectedOutcome
        })),
      recentExecutionResults: context.executionResults.slice(-6).map((execution) => ({
        attackName: execution.attackName,
        success: execution.success,
        status: execution.status,
        message: execution.message,
        vulnerabilityType: execution.vulnerability?.type,
        severity: execution.vulnerability?.severity
      })),
      recentDecisions: context.decisions.slice(-6).map((decision) => ({
        action: decision.action,
        reason: decision.reason,
        confidence: decision.confidence
      })),
      attackChains: context.attackChains.slice(0, 5).map((chain) => ({
        name: chain.name,
        impact: chain.impact,
        effort: chain.effort
      })),
      evidenceCount: context.evidence.length
    };
  }

  private summarizeAttack(attack: Attack) {
    return {
      id: attack.id,
      name: attack.name,
      type: attack.type,
      target: attack.target,
      payload: attack.payload,
      expectedOutcome: attack.expectedOutcome,
      status: attack.status,
      result: attack.result
    };
  }

  private summarizeAttackResult(result: AttackResult) {
    return {
      success: result.success,
      message: result.message,
      evidence: result.evidence,
      vulnerability: result.vulnerability
        ? {
            type: result.vulnerability.type,
            severity: result.vulnerability.severity,
            location: result.vulnerability.location,
            confidence: result.vulnerability.confidence,
            exploitable: result.vulnerability.exploitable
          }
        : undefined,
      timestamp: result.timestamp?.toISOString()
    };
  }

  private buildHeuristicDecision(
    context: PenetrationTestContext,
    availableActions: string[]
  ): Omit<Decision, "id" | "timestamp"> {
    if (availableActions.length === 0) {
      return {
        action: "Report current findings",
        reason: "No explicit next actions were provided, so the safest fallback is to report the current evidence.",
        confidence: 0.62,
        alternative: "Wait for additional authorized actions."
      };
    }

    const recentFailure = context.executionResults
      .slice()
      .reverse()
      .find((execution) => !execution.success);
    const recentSuccess = context.executionResults
      .slice()
      .reverse()
      .find((execution) => execution.success);
    const hasCriticalOrHigh = context.vulnerabilities.some(
      (vulnerability) =>
        vulnerability.severity === "critical" || vulnerability.severity === "high"
    );
    const hasPendingAttacks = context.attackPlan.attacks.some(
      (attack) => attack.status === "pending"
    );

    let preferredAction: string | null = null;
    let reason =
      "Proceed with the next authorized step that preserves evidence quality and safety boundaries.";
    let confidence = 0.68;

    if (context.currentPhase === "recon") {
      preferredAction = this.findActionByKeywords(availableActions, [
        "plan",
        "priorit",
        "analy",
        "review"
      ]);
      reason =
        "Reconnaissance is complete enough to move into planning and prioritize the safest high-value follow-up.";
      confidence = 0.76;
    } else if (recentSuccess && hasCriticalOrHigh) {
      preferredAction = this.findActionByKeywords(availableActions, [
        "authorization",
        "authentication",
        "chain",
        "continue",
        "execute",
        "advance"
      ]);
      reason =
        "The current evidence suggests a meaningful finding, so the highest-value next step is adjacent validation on the same trust boundary.";
      confidence = 0.8;
    } else if (recentFailure) {
      preferredAction = this.findActionByKeywords(availableActions, [
        "alternative",
        "next",
        "distinct",
        "continue",
        "report"
      ]);
      reason =
        "The last attempt did not justify repetition, so breadth or an alternate read-only angle is more valuable than retrying the same surface.";
      confidence = 0.72;
    } else if (!hasPendingAttacks && context.executionResults.length > 0) {
      preferredAction = this.findActionByKeywords(availableActions, [
        "report",
        "summar",
        "complete",
        "stop"
      ]);
      reason =
        "No pending attacks remain, so consolidating the validated evidence is the best next step.";
      confidence = 0.78;
    } else if (hasPendingAttacks) {
      preferredAction = this.findActionByKeywords(availableActions, [
        "continue",
        "execute",
        "next",
        "attack"
      ]);
      reason =
        "Pending read-only attacks remain and the current context does not justify stopping early.";
      confidence = 0.7;
    }

    const action = preferredAction ?? availableActions[0]!;
    return {
      action,
      reason,
      confidence,
      alternative: this.resolveAlternativeAction("", action, availableActions)
    };
  }

  private buildHeuristicEvaluation(
    attack: Attack,
    result: AttackResult
  ): Evaluation {
    const vulnerability = result.vulnerability;
    const success = result.success || Boolean(vulnerability);
    const canEscalate =
      success &&
      Boolean(
        vulnerability?.exploitable ||
          vulnerability?.severity === "critical" ||
          vulnerability?.severity === "high" ||
          attack.type === "authentication" ||
          attack.type === "authorization"
      );

    const insights = this.uniqueStrings(
      [
        result.message,
        vulnerability
          ? `${vulnerability.type} finding at ${vulnerability.location} with ${vulnerability.severity} severity.`
          : "",
        result.evidence ? `Evidence captured: ${result.evidence}` : "",
        success
          ? "The result advanced the assessment with usable evidence."
          : "The result did not confirm the expected condition on this surface."
      ].filter((entry) => entry.trim().length > 0)
    ).slice(0, 6);

    return {
      success,
      insights,
      nextStep: canEscalate
        ? this.nextStepForSuccessfulAttack(attack, vulnerability)
        : this.nextStepForFailedAttack(attack),
      canEscalate,
      confidence: this.heuristicEvaluationConfidence(result, vulnerability)
    };
  }

  private buildHeuristicAlternative(
    failedAttack: Attack,
    context: PenetrationTestContext
  ): Attack {
    const preferredVulnerability = this.pickAlternativeVulnerability(failedAttack, context);
    const moduleType = this.chooseAlternativeModule(
      preferredVulnerability?.type,
      failedAttack.type
    );
    const target = this.normalizeSameOriginTarget(
      preferredVulnerability?.location ?? failedAttack.target,
      context.target,
      failedAttack.target
    );

    return {
      id: randomUUID(),
      name: `Alternative ${this.humanizeModule(moduleType)} validation`,
      type: moduleType,
      target,
      payload: this.defaultPayloadForModule(moduleType),
      expectedOutcome: this.defaultOutcomeForModule(moduleType),
      status: "pending"
    };
  }

  private sanitizeAlternativeAttack(
    proposal: z.infer<typeof ATTACK_OUTPUT_SCHEMA>,
    failedAttack: Attack,
    context: PenetrationTestContext
  ): Attack {
    const type = this.isAllowedModule(proposal.type)
      ? proposal.type
      : this.chooseAlternativeModule(undefined, failedAttack.type);
    const target = this.normalizeSameOriginTarget(
      proposal.target,
      context.target,
      failedAttack.target
    );

    const payload = this.sanitizePayload(proposal.payload, type);
    const expectedOutcome = this.limitText(
      proposal.expectedOutcome,
      240,
      this.defaultOutcomeForModule(type)
    );
    const name = this.limitText(
      proposal.name,
      160,
      `Alternative ${this.humanizeModule(type)} validation`
    );

    return {
      id: randomUUID(),
      name,
      type,
      target,
      payload,
      expectedOutcome,
      status: "pending"
    };
  }

  private isDistinctAlternative(alternative: Attack, failedAttack: Attack): boolean {
    return (
      alternative.type !== failedAttack.type ||
      alternative.target.toLowerCase() !== failedAttack.target.toLowerCase() ||
      alternative.payload.toLowerCase() !== failedAttack.payload.toLowerCase()
    );
  }

  private buildCandidateTargets(context: PenetrationTestContext): string[] {
    return this.uniqueStrings([
      context.target,
      ...context.vulnerabilities.map((vulnerability) => vulnerability.location),
      ...context.attackPlan.attacks.map((attack) => attack.target)
    ]).slice(0, 12);
  }

  private pickAlternativeVulnerability(
    failedAttack: Attack,
    context: PenetrationTestContext
  ): Vulnerability | undefined {
    const sorted = [...context.vulnerabilities].sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });

    return sorted.find(
      (vulnerability) =>
        vulnerability.location.toLowerCase() !== failedAttack.target.toLowerCase() ||
        this.mapVulnerabilityToModule(vulnerability.type) !== failedAttack.type
    );
  }

  private resolveAvailableAction(
    proposedAction: string,
    availableActions: string[]
  ): string | null {
    if (availableActions.length === 0) {
      return proposedAction.trim() || null;
    }

    const normalized = proposedAction.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const exact = availableActions.find(
      (action) => action.trim().toLowerCase() === normalized
    );
    if (exact) {
      return exact;
    }

    const fuzzy = availableActions.find((action) => {
      const candidate = action.trim().toLowerCase();
      return candidate.includes(normalized) || normalized.includes(candidate);
    });
    if (fuzzy) {
      return fuzzy;
    }

    return this.findActionByKeywords(availableActions, normalized.split(/\s+/));
  }

  private resolveAlternativeAction(
    proposedAlternative: string,
    chosenAction: string,
    availableActions: string[]
  ): string {
    const resolved = this.resolveAvailableAction(proposedAlternative, availableActions);
    if (resolved && resolved !== chosenAction) {
      return resolved;
    }

    return (
      availableActions.find((action) => action !== chosenAction) ??
      proposedAlternative.trim() ??
      chosenAction
    );
  }

  private findActionByKeywords(
    actions: string[],
    keywords: string[]
  ): string | null {
    const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
    for (const action of actions) {
      const haystack = action.toLowerCase();
      if (loweredKeywords.some((keyword) => haystack.includes(keyword))) {
        return action;
      }
    }

    return null;
  }

  private nextStepForSuccessfulAttack(
    attack: Attack,
    vulnerability?: Vulnerability
  ): string {
    const module = this.chooseAlternativeModule(vulnerability?.type, attack.type);
    if (attack.type === "authentication" || attack.type === "authorization") {
      return "Prioritize adjacent authorization boundary checks on the same read-only surface.";
    }

    return `Follow up with a ${this.humanizeModule(module).toLowerCase()} validation path on the same or related surface.`;
  }

  private nextStepForFailedAttack(attack: Attack): string {
    if (attack.type === "authentication" || attack.type === "authorization") {
      return "Try a different read-only trust-boundary comparison instead of repeating the same route.";
    }

    return "Shift to a distinct read-only validation angle or a different high-value surface.";
  }

  private heuristicEvaluationConfidence(
    result: AttackResult,
    vulnerability?: Vulnerability
  ): number {
    if (vulnerability) {
      return this.clampConfidence(Math.max(0.6, vulnerability.confidence));
    }

    if (result.success) {
      return 0.72;
    }

    return 0.62;
  }

  private chooseAlternativeModule(
    vulnerabilityType?: string,
    failedType?: string
  ): (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number] {
    const mapped = vulnerabilityType
      ? this.mapVulnerabilityToModule(vulnerabilityType)
      : null;
    if (mapped && mapped !== failedType) {
      return mapped;
    }

    switch (failedType) {
      case "authentication":
        return "authorization";
      case "authorization":
        return "api_security";
      case "api_security":
        return "authorization";
      case "session_management":
        return "authentication";
      case "sql_injection":
        return "api_security";
      case "xss":
        return "session_management";
      case "waf":
        return "api_security";
      default:
        return "authorization";
    }
  }

  private mapVulnerabilityToModule(
    vulnerabilityType: string
  ): (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number] | null {
    const normalized = vulnerabilityType.toLowerCase();
    if (this.isAllowedModule(normalized)) {
      return normalized;
    }

    if (/(auth|login|credential|password)/.test(normalized)) {
      return "authentication";
    }
    if (/(authorization|access control|role|privilege|idor)/.test(normalized)) {
      return "authorization";
    }
    if (/(api|graphql|swagger|cors|json)/.test(normalized)) {
      return "api_security";
    }
    if (/(cookie|session|csrf|token)/.test(normalized)) {
      return "session_management";
    }
    if (/(sql|database|query)/.test(normalized)) {
      return "sql_injection";
    }
    if (/(xss|script|dom|csp)/.test(normalized)) {
      return "xss";
    }
    if (/(waf|filter|block)/.test(normalized)) {
      return "waf";
    }

    return null;
  }

  private defaultPayloadForModule(
    module: (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number]
  ): string {
    switch (module) {
      case "authentication":
        return "Compare anonymous and authenticated read-only responses without modifying state.";
      case "authorization":
        return "Compare lower- and higher-trust read-only responses for the same resource.";
      case "api_security":
        return "Inspect public read-only API metadata and response shaping for sensitive routes.";
      case "session_management":
        return "Review cookie, redirect, and session-boundary behavior with read-only navigation.";
      case "sql_injection":
        return "Compare benign read-only parameter variations and observe error-handling behavior.";
      case "xss":
        return "Inspect reflected rendering contexts with non-executing read-only probes.";
      case "waf":
        return "Repeat a safe read-only request sequence and compare normalization or filtering behavior.";
      default:
        return "Perform a safe read-only validation on the authorized surface.";
    }
  }

  private defaultOutcomeForModule(
    module: (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number]
  ): string {
    switch (module) {
      case "authentication":
        return "Confirm whether privileged content is protected consistently for anonymous users.";
      case "authorization":
        return "Determine whether privilege boundaries change the read-only response as expected.";
      case "api_security":
        return "Identify whether sensitive API routes or metadata are exposed publicly.";
      case "session_management":
        return "Confirm whether session controls and cookie boundaries are enforced consistently.";
      case "sql_injection":
        return "Determine whether benign parameter changes reveal unsafe query-handling patterns.";
      case "xss":
        return "Determine whether attacker-controlled content is reflected into unsafe rendering contexts.";
      case "waf":
        return "Confirm whether defensive filtering changes the safe request path or response shape.";
      default:
        return "Collect read-only evidence about the target surface.";
    }
  }

  private humanizeModule(
    module: (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number]
  ): string {
    switch (module) {
      case "sql_injection":
        return "SQL injection";
      case "xss":
        return "XSS";
      case "api_security":
        return "API security";
      case "session_management":
        return "session management";
      default:
        return module.replace(/_/g, " ");
    }
  }

  private sanitizePayload(
    payload: string,
    module: (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number]
  ): string {
    const trimmed = payload.trim();
    if (!trimmed) {
      return this.defaultPayloadForModule(module);
    }

    const lower = trimmed.toLowerCase();
    if (RISKY_ATTACK_TERMS.some((term) => lower.includes(term))) {
      return this.defaultPayloadForModule(module);
    }

    return this.limitText(trimmed, 280, this.defaultPayloadForModule(module));
  }

  private normalizeSameOriginTarget(
    candidate: string,
    baseTarget: string,
    fallbackTarget: string
  ): string {
    try {
      const baseUrl = new URL(baseTarget);
      const resolved = new URL(candidate, baseUrl);
      if (resolved.origin !== baseUrl.origin) {
        return fallbackTarget;
      }

      resolved.hash = "";
      return resolved.toString();
    } catch {
      return fallbackTarget;
    }
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

  private isAllowedModule(value: string): value is (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number] {
    return (AUTHORIZED_SECURITY_TEST_MODULES as readonly string[]).includes(value);
  }

  private clampConfidence(confidence: number): number {
    return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  }

  private limitText(value: string, limit: number, fallback: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    return trimmed.length <= limit ? trimmed : trimmed.slice(0, limit).trim();
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
}
