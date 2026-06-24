import { randomUUID } from "crypto";

import type { Logger } from "pino";
import { z } from "zod";

import type { AccessContext } from "../../../authorization/authorization.types";
import { AppError } from "../../../utils/app-error";
import type {
  AuthorizedSecurityTestAuthProfile,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestReport
} from "../../authorized-testing/authorized-security-testing.types";
import { AUTHORIZED_SECURITY_TEST_MODULES } from "../../authorized-testing/authorized-security-testing.types";
import type { AuthorizedSecurityTestingService } from "../../authorized-testing/authorized-security-testing.service";
import type { LLMService } from "../../llm/llm.service";
import type { Evaluation } from "../decision-engine.service";
import type { DecisionEngine } from "../decision-engine.service";
import type {
  Attack,
  AttackChain,
  AttackPlan,
  AttackResult,
  Decision,
  Evidence,
  ExecutionResult as ContextExecutionResult,
  PenetrationTestContext,
  Vulnerability
} from "../penetration-test-orchestrator.service";

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

const CHAIN_SCHEMA = z.object({
  chains: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        impact: z.enum(["critical", "high", "medium", "low"]),
        effort: z.enum(["easy", "medium", "hard"]),
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
          .max(4)
      })
    )
    .max(3)
});

export interface ExecutionResult {
  attackId: string;
  success: boolean;
  result: AttackResult;
  evidence: Evidence[];
  chained?: boolean;
  timestamp: Date;
}

export interface ExecutionPhaseOptions {
  actor?: AccessContext;
  authProfiles?: AuthorizedSecurityTestAuthProfile[];
  maxPages?: number;
  maxRequests?: number;
  defaultProvider?: string;
  defaultModel?: string;
  now?: () => Date;
  onProgress?: (phase: string, message: string) => void;
}

interface AiProviderSelection {
  provider: string;
  model: string;
}

export class ExecutionPhase {
  private readonly actor?: AccessContext;
  private readonly authProfiles: AuthorizedSecurityTestAuthProfile[];
  private readonly maxPages: number;
  private readonly maxRequests: number;
  private readonly defaultProvider?: string;
  private readonly defaultModel?: string;
  private readonly now: () => Date;
  private readonly onProgress?: ExecutionPhaseOptions["onProgress"];

  private currentPlan?: AttackPlan;
  private currentContext?: PenetrationTestContext;
  private currentAttackBudget = 0;
  private remainingRequestBudget = 0;
  private currentAttackIndex = -1;
  private stopRequested = false;
  private latestEvaluation?: Evaluation;
  private latestReports = new Map<string, AuthorizedSecurityTestReport | undefined>();

  constructor(
    private readonly activeTester: AuthorizedSecurityTestingService,
    private readonly decisionEngine: DecisionEngine,
    private readonly llm: LLMService,
    private readonly logger: Logger,
    options: ExecutionPhaseOptions = {}
  ) {
    this.actor = options.actor;
    this.authProfiles = this.normalizeAuthProfiles(options.authProfiles);
    this.maxPages = this.normalizeMaxPages(options.maxPages);
    this.maxRequests = this.normalizeMaxRequests(options.maxRequests);
    this.defaultProvider = options.defaultProvider?.trim() || undefined;
    this.defaultModel = options.defaultModel?.trim() || undefined;
    this.now = options.now ?? (() => new Date());
    this.onProgress = options.onProgress;
  }

  async execute(
    plan: AttackPlan,
    context: PenetrationTestContext
  ): Promise<ExecutionResult[]> {
    this.currentPlan = plan;
    this.currentContext = context;
    this.remainingRequestBudget = this.maxRequests;
    this.currentAttackBudget = 0;
    this.currentAttackIndex = -1;
    this.stopRequested = false;
    this.latestEvaluation = undefined;
    this.latestReports.clear();

    context.currentPhase = "execution";
    context.attackPlan = plan;
    this.emitProgress(
      "execution",
      `Starting execution phase with ${plan.attacks.length} planned attack(s).`
    );
    this.logger.info(
      {
        target: context.target,
        verificationId: context.verificationId,
        plannedAttacks: plan.attacks.length,
        requestBudget: this.maxRequests
      },
      "Execution phase started"
    );

    const results: ExecutionResult[] = [];

    try {
      for (let index = 0; index < plan.attacks.length; index += 1) {
        const attack = plan.attacks[index];
        if (!attack || attack.status !== "pending") {
          continue;
        }

        this.currentAttackIndex = index;
        this.latestEvaluation = undefined;

        if (!this.isAttackSafe(attack, context.target)) {
          const skippedResult = this.buildSkippedResult(
            "Skipped because the attack exceeded the read-only safety boundary."
          );
          attack.status = "skipped";
          attack.result = skippedResult.message;
          attack.timestamp = skippedResult.timestamp ?? this.now();
          const evidence = await this.collectEvidence(attack, skippedResult);
          results.push({
            attackId: attack.id,
            success: false,
            result: skippedResult,
            evidence: [evidence],
            timestamp: attack.timestamp
          });
          this.pushContextExecutionResult(attack, skippedResult);
          continue;
        }

        if (this.remainingRequestBudget < 6) {
          const budgetResult = this.buildSkippedResult(
            "Skipped because the remaining request budget was exhausted."
          );
          attack.status = "skipped";
          attack.result = budgetResult.message;
          attack.timestamp = budgetResult.timestamp ?? this.now();
          const evidence = await this.collectEvidence(attack, budgetResult);
          results.push({
            attackId: attack.id,
            success: false,
            result: budgetResult,
            evidence: [evidence],
            timestamp: attack.timestamp
          });
          this.pushContextExecutionResult(attack, budgetResult);
          continue;
        }

        const pendingIncludingCurrent = plan.attacks.filter(
          (candidate) => candidate.status === "pending"
        ).length;
        this.currentAttackBudget = Math.max(
          6,
          Math.min(
            this.remainingRequestBudget,
            Math.floor(this.remainingRequestBudget / Math.max(1, pendingIncludingCurrent))
          )
        );

        attack.status = "running";
        attack.timestamp = this.now();
        this.emitProgress(
          "execution",
          `Running ${attack.name} with a ${this.currentAttackBudget}-request budget.`
        );

        const result = await this.executeSingleAttack(attack);
        const report = this.latestReports.get(attack.id);
        const requestsSent = report?.summary.requestsSent ?? this.currentAttackBudget;
        this.remainingRequestBudget = Math.max(0, this.remainingRequestBudget - requestsSent);

        attack.status = result.success ? "success" : "failed";
        attack.result = result.message;
        attack.evidence = result.evidence;
        attack.timestamp = result.timestamp ?? this.now();

        this.latestEvaluation = await this.decisionEngine.evaluateResult(attack, result);
        const evidenceEntries = [await this.collectEvidence(attack, result)];

        if (result.vulnerability) {
          this.mergeVulnerabilities([result.vulnerability]);
        }

        this.pushContextExecutionResult(attack, result, report);
        const executionResult: ExecutionResult = {
          attackId: attack.id,
          success: result.success,
          result,
          evidence: evidenceEntries,
          timestamp: attack.timestamp
        };
        results.push(executionResult);

        if (result.success) {
          await this.handleSuccess(attack, result);
        } else {
          await this.handleFailure(attack, result);
        }

        if (this.stopRequested) {
          break;
        }
      }

      const chains = await this.attemptChaining(context.vulnerabilities);
      context.attackChains = chains;
      if (chains.length > 0) {
        const chainEvidence: Evidence = {
          id: randomUUID(),
          type: "execution",
          description: "Attack chain analysis completed.",
          data: this.cloneSerializable({
            chains
          }),
          timestamp: this.now()
        };
        context.evidence.push(chainEvidence);
      }

      const chainedVulnerabilities = new Set<string>();
      for (const chain of chains) {
        for (const step of chain.steps) {
          chainedVulnerabilities.add(step.vulnerability);
        }
      }
      for (const record of results) {
        const vulnerabilityId = record.result.vulnerability?.id;
        if (vulnerabilityId && chainedVulnerabilities.has(vulnerabilityId)) {
          record.chained = true;
        }
      }

      this.emitProgress(
        "execution",
        `Execution phase completed with ${results.filter((result) => result.success).length} successful attack(s).`
      );
      this.logger.info(
        {
          target: context.target,
          executedAttacks: results.length,
          successfulAttacks: results.filter((result) => result.success).length,
          chains: context.attackChains.length,
          remainingRequestBudget: this.remainingRequestBudget
        },
        "Execution phase completed"
      );

      return results;
    } catch (error) {
      this.logger.error(
        {
          error,
          target: context.target,
          verificationId: context.verificationId
        },
        "Execution phase failed"
      );
      this.emitProgress("execution", "Execution phase failed.");

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Execution phase failed.", 502, {
        target: context.target,
        verificationId: context.verificationId,
        cause: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.currentAttackIndex = -1;
      this.latestEvaluation = undefined;
    }
  }

  private async executeSingleAttack(attack: Attack): Promise<AttackResult> {
    const context = this.requireContext();
    const module = this.toAuthorizedModule(attack.type);
    if (!module) {
      this.latestReports.set(attack.id, undefined);
      return {
        success: false,
        message: `Attack type '${attack.type}' is not supported by the authorized testing engine.`,
        timestamp: this.now()
      };
    }

    try {
      const report = await this.runAuthorizedTest(module, attack, context);
      this.latestReports.set(attack.id, report);
      const firstFinding = report.findings[0];
      const vulnerability = firstFinding
        ? this.toActiveVulnerability(firstFinding, report)
        : undefined;
      const evidence =
        report.findings.length > 0
          ? report.findings
              .map((finding) => `${finding.title}: ${finding.evidence.join("; ")}`)
              .join(" | ")
          : report.summary.headline;

      return {
        success: report.findings.length > 0,
        message: report.summary.headline,
        evidence,
        vulnerability,
        timestamp: this.now()
      };
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.message.includes("requires an AccessContext") ||
          error.message.includes("ExecutionPhase requires"))
      ) {
        throw error;
      }

      this.latestReports.set(attack.id, undefined);
      const message =
        error instanceof Error
          ? error.message
          : "The authorized testing service failed to execute the attack.";
      this.logger.warn(
        {
          error,
          attackId: attack.id,
          attackType: attack.type,
          target: attack.target
        },
        "Single attack execution failed"
      );
      return {
        success: false,
        message,
        evidence: message,
        timestamp: this.now()
      };
    }
  }

  private async handleSuccess(attack: Attack, result: AttackResult): Promise<void> {
    const context = this.requireContext();
    const decision = await this.decisionEngine.decideNextAction(context, [
      "Continue with next planned attack",
      "Prioritize related authorization checks",
      "Skip remaining and report findings"
    ]);
    this.recordDecision(decision);

    const action = decision.action.toLowerCase();
    const shouldStop =
      action.includes("skip remaining") || action.includes("report findings");
    if (shouldStop) {
      this.skipRemainingAttacks(
        "The decision engine concluded the remaining attacks would add low value within the current safety boundary."
      );
      this.stopRequested = true;
      return;
    }

    const shouldPrioritizeAuthorization =
      result.vulnerability?.type === "authentication" ||
      action.includes("prioritize") ||
      this.latestEvaluation?.canEscalate === true;
    if (shouldPrioritizeAuthorization) {
      this.prioritizeNextAttack("authorization", this.currentAttackIndex);
    }
  }

  private async handleFailure(attack: Attack, result: AttackResult): Promise<void> {
    const context = this.requireContext();
    const decision = await this.decisionEngine.decideNextAction(context, [
      "Continue with next distinct safe attack",
      "Generate alternative attack",
      "Deprioritize similar attacks",
      "Skip remaining and report findings"
    ]);
    this.recordDecision(decision);

    const action = decision.action.toLowerCase();
    if (action.includes("skip remaining") || action.includes("report findings")) {
      this.skipRemainingAttacks(
        "The decision engine concluded remaining attacks should be replaced by reporting."
      );
      this.stopRequested = true;
      return;
    }

    if (action.includes("deprioritize")) {
      this.skipPendingAttacksOfType(
        attack.type,
        "A prior attack on the same surface failed and similar pending attacks were deprioritized."
      );
      return;
    }

    if (action.includes("generate alternative")) {
      const alternative = await this.adaptStrategy(attack, result);
      this.insertAttackAfterCurrent(alternative);
    }
  }

  private async adaptStrategy(attack: Attack, result: AttackResult): Promise<Attack> {
    const context = this.requireContext();
    const alternative = await this.decisionEngine.suggestAlternative(attack, context);
    const sanitized = this.sanitizeAlternativeAttack(alternative, attack, context.target);

    this.logger.info(
      {
        failedAttackId: attack.id,
        failedAttackType: attack.type,
        alternativeType: sanitized.type,
        alternativeTarget: sanitized.target,
        message: result.message
      },
      "Adapted execution strategy after failed attack"
    );

    return sanitized;
  }

  private async collectEvidence(attack: Attack, result: AttackResult): Promise<Evidence> {
    const context = this.requireContext();
    const report = this.latestReports.get(attack.id);

    const evidence: Evidence = {
      id: randomUUID(),
      type: "execution",
      description: `${attack.name} ${result.success ? "completed" : attack.status === "skipped" ? "was skipped" : "failed"}.`,
      data: this.cloneSerializable({
        attackId: attack.id,
        attackType: attack.type,
        attackTarget: attack.target,
        success: result.success,
        message: result.message,
        evidence: result.evidence,
        vulnerability: result.vulnerability,
        evaluation: this.latestEvaluation,
        rawReport: report
      }),
      timestamp: result.timestamp ?? this.now()
    };

    context.evidence.push(evidence);
    return evidence;
  }

  private async attemptChaining(
    vulnerabilities: Vulnerability[]
  ): Promise<AttackChain[]> {
    const context = this.requireContext();
    if (vulnerabilities.length < 2) {
      return [];
    }

    try {
      const providerSelection = await this.selectAiProviderAndModel();
      if (!providerSelection) {
        return this.buildAttackChainsHeuristically(vulnerabilities);
      }

      const output = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are analyzing an authorized read-only penetration test. Build only defensive attack-chain narratives from the provided vulnerabilities and results. Do not invent exploit steps, payloads, or destructive guidance. Keep the chains factual, concise, and grounded in the evidence."
            },
            {
              role: "user",
              content: JSON.stringify({
                target: context.target,
                vulnerabilities: vulnerabilities.map((vulnerability) => ({
                  id: vulnerability.id,
                  type: vulnerability.type,
                  severity: vulnerability.severity,
                  location: vulnerability.location,
                  description: vulnerability.description,
                  evidence: vulnerability.evidence,
                  exploitable: vulnerability.exploitable
                })),
                executionResults: context.executionResults.slice(-10).map((result) => ({
                  attackName: result.attackName,
                  success: result.success,
                  message: result.message,
                  vulnerability: result.vulnerability
                    ? {
                        id: result.vulnerability.id,
                        type: result.vulnerability.type,
                        severity: result.vulnerability.severity,
                        location: result.vulnerability.location
                      }
                    : null
                }))
              })
            }
          ]
        },
        CHAIN_SCHEMA
      );

      const mapped = this.mapAiChains(output.chains, vulnerabilities);
      return mapped.length > 0 ? mapped : this.buildAttackChainsHeuristically(vulnerabilities);
    } catch (error) {
      this.logger.warn(
        {
          error,
          target: context.target,
          vulnerabilityCount: vulnerabilities.length
        },
        "AI attack chaining failed, using heuristic chaining"
      );
      return this.buildAttackChainsHeuristically(vulnerabilities);
    }
  }

  private async runAuthorizedTest(
    module: AuthorizedSecurityTestModule,
    attack: Attack,
    context: PenetrationTestContext
  ): Promise<AuthorizedSecurityTestReport> {
    const tester = this.activeTester as unknown as {
      runAuthorizedSecurityTest?: (
        ...args: unknown[]
      ) => Promise<AuthorizedSecurityTestReport>;
    };
    if (typeof tester.runAuthorizedSecurityTest !== "function") {
      throw new AppError(
        "ExecutionPhase requires an AuthorizedSecurityTestingService-compatible active tester.",
        500
      );
    }

    const input = {
      verificationId: context.verificationId,
      url: this.normalizeAttackTarget(attack.target, context.target),
      maxPages: this.maxPages,
      maxRequests: this.currentAttackBudget,
      modules: [module],
      authProfiles:
        module === "authorization" || module === "authentication"
          ? this.authProfiles
          : this.authProfiles.filter((profile) => profile.role === "anonymous")
    };

    if (this.actor) {
      return tester.runAuthorizedSecurityTest(this.actor, input);
    }

    if (tester.runAuthorizedSecurityTest.length <= 1) {
      return tester.runAuthorizedSecurityTest(input);
    }

    throw new AppError(
      "ExecutionPhase requires an AccessContext to execute AuthorizedSecurityTestingService.runAuthorizedSecurityTest(...).",
      500,
      {
        target: context.target,
        verificationId: context.verificationId
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
              this.normalizeModelName(model) === this.normalizeModelName(requestedModel)
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

  private buildSkippedResult(message: string): AttackResult {
    return {
      success: false,
      message,
      evidence: message,
      timestamp: this.now()
    };
  }

  private pushContextExecutionResult(
    attack: Attack,
    result: AttackResult,
    report?: AuthorizedSecurityTestReport
  ): void {
    const context = this.requireContext();
    const record: ContextExecutionResult = {
      attackId: attack.id,
      attackName: attack.name,
      success: result.success,
      status: attack.status === "success" || attack.status === "failed" || attack.status === "skipped"
        ? attack.status
        : result.success
          ? "success"
          : "failed",
      message: result.message,
      evidence: result.evidence,
      vulnerability: result.vulnerability,
      timestamp: result.timestamp ?? this.now(),
      rawData: report
    };
    context.executionResults.push(record);
  }

  private recordDecision(decision: Decision): void {
    const context = this.requireContext();
    context.decisions.push(decision);
  }

  private mergeVulnerabilities(vulnerabilities: Vulnerability[]): void {
    const context = this.requireContext();
    const current = new Map<string, Vulnerability>();
    for (const vulnerability of context.vulnerabilities) {
      current.set(this.vulnerabilityKey(vulnerability), vulnerability);
    }

    for (const vulnerability of vulnerabilities) {
      const key = this.vulnerabilityKey(vulnerability);
      const existing = current.get(key);
      if (!existing) {
        current.set(key, vulnerability);
        continue;
      }

      current.set(
        key,
        this.compareSeverity(vulnerability.severity, existing.severity) >= 0 &&
          vulnerability.confidence >= existing.confidence
          ? vulnerability
          : existing
      );
    }

    context.vulnerabilities = Array.from(current.values()).sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });
  }

  private buildAttackChainsHeuristically(
    vulnerabilities: Vulnerability[]
  ): AttackChain[] {
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
      chains.push({
        id: randomUUID(),
        name: "Privilege boundary failure chain",
        impact: "critical",
        effort: "easy",
        businessImpact:
          "A public attacker can discover privileged routes, confirm missing authentication pressure, and then demonstrate missing authorization separation.",
        steps: [
          {
            step: 1,
            vulnerability: passiveAdminSurface.id,
            action: "Use passive reconnaissance to locate privileged-looking application routes.",
            result: passiveAdminSurface.description,
            evidence: passiveAdminSurface.evidence,
            nextStep: "Validate whether the routes challenge anonymous access."
          },
          {
            step: 2,
            vulnerability: authentication.id,
            action: "Run read-only authentication validation against the exposed route.",
            result: authentication.description,
            evidence: authentication.evidence,
            nextStep: "Compare lower-trust and higher-trust responses."
          },
          {
            step: 3,
            vulnerability: authorization.id,
            action: "Run differential authorization checks across approved profiles.",
            result: authorization.description,
            evidence: authorization.evidence,
            nextStep: "Report the privilege-boundary failure and remediation path."
          }
        ]
      });
    }

    if (apiExposure && authentication) {
      chains.push({
        id: randomUUID(),
        name: "API exposure to access-control validation chain",
        impact: "high",
        effort: "medium",
        businessImpact:
          "Exposed API surface shortens attacker discovery time and increases the chance of unauthorized data access if route protection is weak.",
        steps: [
          {
            step: 1,
            vulnerability: apiExposure.id,
            action: "Identify exposed API surface through passive and guarded active discovery.",
            result: apiExposure.description,
            evidence: apiExposure.evidence,
            nextStep: "Validate whether the exposed surface enforces authentication."
          },
          {
            step: 2,
            vulnerability: authentication.id,
            action: "Confirm authentication behavior against the exposed API surface.",
            result: authentication.description,
            evidence: authentication.evidence,
            nextStep: "Prioritize remediation around API access controls."
          }
        ]
      });
    }

    if (chains.length === 0 && authentication && authorization) {
      chains.push({
        id: randomUUID(),
        name: "Confirmed access-control chain",
        impact: "high",
        effort: "easy",
        businessImpact:
          "The target failed both authentication and authorization validation on a related privileged surface, creating a coherent path to unauthorized access.",
        steps: [
          {
            step: 1,
            vulnerability: authentication.id,
            action: "Validate whether the privileged surface enforces authentication.",
            result: authentication.description,
            evidence: authentication.evidence,
            nextStep: "Compare how lower-trust and higher-trust identities are handled."
          },
          {
            step: 2,
            vulnerability: authorization.id,
            action: "Run differential authorization checks across approved profiles.",
            result: authorization.description,
            evidence: authorization.evidence,
            nextStep: "Report the confirmed access-control chain and remediation path."
          }
        ]
      });
    }

    return chains;
  }

  private mapAiChains(
    chains: z.infer<typeof CHAIN_SCHEMA>["chains"],
    vulnerabilities: Vulnerability[]
  ): AttackChain[] {
    const vulnerabilityMap = new Map(
      vulnerabilities.map((vulnerability) => [vulnerability.id, vulnerability] as const)
    );
    const mapped: AttackChain[] = [];

    for (const chain of chains) {
      const steps = chain.steps
        .map((step, index) => {
          const vulnerability = vulnerabilityMap.get(step.vulnerabilityId);
          if (!vulnerability) {
            return null;
          }

          return {
            step: index + 1,
            vulnerability: vulnerability.id,
            action: step.action,
            result: step.result,
            evidence: step.evidence,
            nextStep: step.nextStep
          };
        })
        .filter((step): step is AttackChain["steps"][number] => Boolean(step));

      if (steps.length < 2) {
        continue;
      }

      mapped.push({
        id: randomUUID(),
        name: chain.name,
        impact: chain.impact,
        effort: chain.effort,
        businessImpact: chain.businessImpact,
        steps
      });
    }

    return mapped;
  }

  private insertAttackAfterCurrent(attack: Attack): void {
    const plan = this.requirePlan();
    if (!this.isAttackSafe(attack, this.requireContext().target)) {
      return;
    }

    const insertionIndex = Math.max(0, this.currentAttackIndex + 1);
    plan.attacks.splice(insertionIndex, 0, attack);
  }

  private skipRemainingAttacks(reason: string): void {
    const plan = this.requirePlan();
    for (const attack of plan.attacks) {
      if (attack.status === "pending") {
        attack.status = "skipped";
        attack.result = reason;
        attack.timestamp = this.now();
      }
    }
  }

  private skipPendingAttacksOfType(type: string, reason: string): void {
    const plan = this.requirePlan();
    for (const attack of plan.attacks) {
      if (attack.status === "pending" && attack.type === type) {
        attack.status = "skipped";
        attack.result = reason;
        attack.timestamp = this.now();
      }
    }
  }

  private prioritizeNextAttack(type: string, afterIndex: number): void {
    const plan = this.requirePlan();
    const nextIndex = plan.attacks.findIndex(
      (attack, index) =>
        index > afterIndex &&
        attack.status === "pending" &&
        attack.type === type
    );
    if (nextIndex <= afterIndex + 1 || nextIndex === -1) {
      return;
    }

    const [attack] = plan.attacks.splice(nextIndex, 1);
    if (!attack) {
      return;
    }

    plan.attacks.splice(afterIndex + 1, 0, attack);
  }

  private sanitizeAlternativeAttack(
    attack: Attack,
    failedAttack: Attack,
    target: string
  ): Attack {
    const type = this.toAuthorizedModule(attack.type) ?? this.chooseFallbackModule(failedAttack.type);
    return {
      id: attack.id?.trim() || randomUUID(),
      name: attack.name.trim() || `Alternative ${type} validation`,
      type,
      target: this.normalizeAttackTarget(attack.target, target),
      payload: this.sanitizePayload(attack.payload, type),
      expectedOutcome:
        attack.expectedOutcome.trim() || "Collect additional read-only evidence safely.",
      status: "pending"
    };
  }

  private chooseFallbackModule(
    failedType: string
  ): AuthorizedSecurityTestModule {
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

  private sanitizePayload(
    payload: string,
    module: AuthorizedSecurityTestModule
  ): string {
    const trimmed = payload.trim();
    if (!trimmed) {
      return this.defaultPayloadForModule(module);
    }

    const lower = trimmed.toLowerCase();
    if (RISKY_ATTACK_TERMS.some((term) => lower.includes(term))) {
      return this.defaultPayloadForModule(module);
    }

    return trimmed;
  }

  private defaultPayloadForModule(module: AuthorizedSecurityTestModule): string {
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

  private isAttackSafe(attack: Attack, baseTarget: string): boolean {
    let targetOrigin: string;
    let attackOrigin: string;

    try {
      targetOrigin = new URL(baseTarget).origin;
      attackOrigin = new URL(this.normalizeAttackTarget(attack.target, baseTarget)).origin;
    } catch {
      return false;
    }

    if (attackOrigin !== targetOrigin) {
      return false;
    }

    if (!this.toAuthorizedModule(attack.type)) {
      return false;
    }

    const haystack = `${attack.name} ${attack.payload} ${attack.expectedOutcome}`.toLowerCase();
    return !RISKY_ATTACK_TERMS.some((term) => haystack.includes(term));
  }

  private toAuthorizedModule(type: string): AuthorizedSecurityTestModule | null {
    return (AUTHORIZED_SECURITY_TEST_MODULES as readonly string[]).includes(type)
      ? (type as AuthorizedSecurityTestModule)
      : null;
  }

  private toActiveVulnerability(
    finding: AuthorizedSecurityTestReport["findings"][number],
    report: AuthorizedSecurityTestReport
  ): Vulnerability {
    return {
      id: finding.id,
      type: finding.category,
      severity: this.mapActiveSeverity(finding.severity),
      location: this.extractLocationFromActiveFinding(finding, report),
      description: finding.summary,
      evidence: finding.evidence.join("; "),
      remediation: finding.remediation,
      confidence:
        finding.validation?.confidence !== undefined
          ? Number((finding.validation.confidence / 100).toFixed(2))
          : 0.8,
      exploitable: finding.validation?.disposition !== "unlikely"
    };
  }

  private mapActiveSeverity(
    severity: "info" | "low" | "medium" | "high"
  ): Vulnerability["severity"] {
    switch (severity) {
      case "high":
        return "high";
      case "medium":
        return "medium";
      default:
        return "low";
    }
  }

  private extractLocationFromActiveFinding(
    finding: AuthorizedSecurityTestReport["findings"][number],
    report: AuthorizedSecurityTestReport
  ): string {
    const endpointEvidence = finding.evidence.find((entry) => entry.startsWith("endpoint="));
    if (endpointEvidence) {
      return endpointEvidence.slice("endpoint=".length);
    }

    return finding.apiDetails?.endpoint ?? report.target.requestedUrl;
  }

  private normalizeAttackTarget(target: string, baseTarget: string): string {
    try {
      const baseUrl = new URL(baseTarget);
      const resolved = new URL(target, baseUrl);
      if (resolved.origin !== baseUrl.origin) {
        return baseUrl.toString();
      }

      resolved.hash = "";
      return resolved.toString();
    } catch {
      return new URL(baseTarget).toString();
    }
  }

  private normalizeAuthProfiles(
    profiles?: AuthorizedSecurityTestAuthProfile[]
  ): AuthorizedSecurityTestAuthProfile[] {
    if (!profiles || profiles.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: AuthorizedSecurityTestAuthProfile[] = [];
    for (const profile of profiles.slice(0, 4)) {
      const name = profile.name.trim();
      if (!name || seen.has(name.toLowerCase())) {
        continue;
      }

      seen.add(name.toLowerCase());
      normalized.push({
        name,
        role: profile.role,
        headers: { ...(profile.headers ?? {}) },
        cookies: { ...(profile.cookies ?? {}) }
      });
    }

    return normalized;
  }

  private normalizeMaxPages(value?: number): number {
    const numeric = Math.trunc(value ?? 4);
    return Math.max(1, Math.min(8, numeric));
  }

  private normalizeMaxRequests(value?: number): number {
    const numeric = Math.trunc(value ?? 18);
    return Math.max(6, Math.min(40, numeric));
  }

  private normalizeModelName(model: string): string {
    return model.trim().toLowerCase();
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

  private vulnerabilityKey(vulnerability: Vulnerability): string {
    return [
      vulnerability.type.toLowerCase(),
      vulnerability.location.toLowerCase(),
      vulnerability.description.toLowerCase()
    ].join("::");
  }

  private cloneSerializable<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private requireContext(): PenetrationTestContext {
    if (!this.currentContext) {
      throw new AppError("ExecutionPhase is not initialized with a context.", 500);
    }

    return this.currentContext;
  }

  private requirePlan(): AttackPlan {
    if (!this.currentPlan) {
      throw new AppError("ExecutionPhase is not initialized with a plan.", 500);
    }

    return this.currentPlan;
  }

  private emitProgress(phase: string, message: string): void {
    this.logger.info({ phase, message }, "Execution phase progress");
    this.onProgress?.(phase, message);
  }
}
