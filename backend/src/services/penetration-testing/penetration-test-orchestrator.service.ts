import { randomUUID } from "crypto";
import { EventEmitter } from "events";

import pino, { Logger } from "pino";
import { z } from "zod";

import { AccessContext } from "../../authorization/authorization.types";
import {
  TaskEntity,
  TaskMetadata,
  TaskStepStatus,
  TaskStepTrace
} from "../../database/entities/task.entity";
import { AgentRepository } from "../../database/repositories/agent.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { AppError } from "../../utils/app-error";
import {
  AUTHORIZED_SECURITY_TEST_MODULES,
  AuthorizedSecurityTestAuthEndpointDescriptorInput,
  AuthorizedSecurityManualFormValidationInput,
  AuthorizedSecurityTestAuthProfile,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestReport
} from "../authorized-testing/authorized-security-testing.types";
import { AuthorizedSecurityTestingService } from "../authorized-testing/authorized-security-testing.service";
import { LLMService } from "../llm/llm.service";
import {
  SecurityReviewFinding,
  SecurityReviewResult,
  SecurityReviewService as SecurityReviewLab
} from "../security-review/security-review.service";
import { RemediationEngine } from "./remediation-engine.service";

const ATTACK_PLAN_SCHEMA = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  estimatedSuccess: z.number().min(0).max(1),
  attacks: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(AUTHORIZED_SECURITY_TEST_MODULES),
        target: z.string().min(1),
        payload: z.string().min(1).max(280),
        expectedOutcome: z.string().min(1)
      })
    )
    .min(1)
    .max(6)
});

const DECISION_SCHEMA = z.object({
  action: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  alternative: z.string().min(1)
});

const REPORT_SCHEMA = z.object({
  executiveSummary: z.string().min(1),
  narrative: z.string().min(1),
  impact: z.string().min(1),
  recommendations: z.array(z.string().min(1)).min(1).max(8)
});

const ALLOWED_ATTACK_TYPES = new Set<AuthorizedSecurityTestModule>(
  AUTHORIZED_SECURITY_TEST_MODULES
);

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

const PHASE_DESCRIPTIONS: Record<
  PenetrationTestContext["currentPhase"],
  string
> = {
  recon: "Passively inspect the target and capture the baseline attack surface.",
  planning: "Turn reconnaissance into a safe, read-only attack plan.",
  execution: "Run approved active checks through the authorized testing engine.",
  reporting: "Assemble the attack narrative, impact, and evidence.",
  complete: "Testing and reporting completed."
};

const PHASE_TITLES: Record<PenetrationTestContext["currentPhase"], string> = {
  recon: "Reconnaissance Phase",
  planning: "Planning Phase",
  execution: "Execution Phase",
  reporting: "Reporting Phase",
  complete: "Complete"
};

export interface PenetrationTestContext {
  target: string;
  verificationId: string;
  startTime: Date;
  reconData: any;
  vulnerabilities: Vulnerability[];
  attackPlan: AttackPlan;
  executionResults: ExecutionResult[];
  attackChains: AttackChain[];
  evidence: Evidence[];
  decisions: Decision[];
  currentPhase: "recon" | "planning" | "execution" | "reporting" | "complete";
  isComplete: boolean;
}

export interface Vulnerability {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  description: string;
  evidence: string;
  remediation: string;
  confidence: number;
  exploitable: boolean;
}

export interface AttackPlan {
  id: string;
  name: string;
  description: string;
  attacks: Attack[];
  priority: "high" | "medium" | "low";
  estimatedSuccess: number;
}

export interface Attack {
  id: string;
  name: string;
  type: string;
  target: string;
  payload: string;
  expectedOutcome: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: string;
  evidence?: string;
  timestamp?: Date;
}

export interface AttackChain {
  id: string;
  name: string;
  steps: AttackChainStep[];
  impact: "critical" | "high" | "medium" | "low";
  effort: "easy" | "medium" | "hard";
  businessImpact: string;
}

export interface AttackChainStep {
  step: number;
  vulnerability: string;
  action: string;
  result: string;
  evidence: string;
  nextStep: string;
}

export interface Decision {
  id: string;
  action: string;
  reason: string;
  confidence: number;
  alternative: string;
  timestamp: Date;
}

export interface Evidence {
  id: string;
  type: string;
  description: string;
  data: any;
  timestamp: Date;
}

export interface ExecutionResult {
  attackId: string;
  attackName: string;
  success: boolean;
  status: Attack["status"];
  message: string;
  evidence?: string;
  vulnerability?: Vulnerability;
  timestamp: Date;
  rawData?: any;
}

export interface PenetrationTestReport {
  id: string;
  target: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  executiveSummary: string;
  narrative: string;
  engagement: PenetrationTestEngagementMetadata;
  assurance: PenetrationTestAssuranceSummary;
  remediationPlan: PenetrationTestRemediationPlan;
  vulnerabilities: Vulnerability[];
  attackChains: AttackChain[];
  impact: string;
  recommendations: string[];
  evidence: Evidence[];
  rawData: any;
}

export type PenetrationTestRemediationPriority =
  | "immediate"
  | "high"
  | "medium"
  | "hardening";

export type PenetrationTestRemediationOwner =
  | "application"
  | "identity"
  | "platform"
  | "data"
  | "security"
  | "product";

export interface PenetrationTestRemediationWorkItem {
  id: string;
  title: string;
  priority: PenetrationTestRemediationPriority;
  owner: PenetrationTestRemediationOwner;
  summary: string;
  affectedLocations: string[];
  sourceVulnerabilityIds: string[];
  validationPlan: string;
}

export interface PenetrationTestRemediationPlan {
  headline: string;
  quickWins: string[];
  strategicFixes: string[];
  workItems: PenetrationTestRemediationWorkItem[];
}

export interface PenetrationTestManualFormValidationSummary {
  enabled: true;
  rateLimitPerMinute: number;
  credentialLabels: string[];
  notes?: string;
}

export interface PenetrationTestEngagementMetadata {
  targetOrigin: string;
  verificationId: string;
  passivePageLimit: number;
  requestBudget: number;
  authProfiles: string[];
  declaredAuthEndpoints: number;
  guardrails: string[];
  manualFormValidation?: PenetrationTestManualFormValidationSummary;
}

export interface PenetrationTestAssuranceSummary {
  readOnlyOnly: true;
  sameOriginOnly: true;
  auditTrailEntries: number;
  evidenceItems: number;
  decisions: number;
  successfulValidations: number;
  attackChainCount: number;
}

export interface AttackResult {
  success: boolean;
  message: string;
  evidence?: string;
  vulnerability?: Vulnerability;
  timestamp?: Date;
}

export interface PenetrationTestStreamEvent {
  id: string;
  runId: string;
  target: string;
  phase: PenetrationTestContext["currentPhase"];
  type:
    | "status"
    | "phase"
    | "finding"
    | "decision"
    | "evidence"
    | "attack"
    | "report"
    | "audit"
    | "error"
    | "complete";
  message?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface PenetrationTestAuditEntry {
  id: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface PenetrationTestTaskMetadata extends TaskMetadata {
  penetrationTest: {
    runId: string;
    context: PenetrationTestContext;
    auditTrail: PenetrationTestAuditEntry[];
    report?: PenetrationTestReport;
    taskId?: string;
    agentId?: string;
  };
}

export interface PenetrationTestOrchestratorDependencies {
  actor?: AccessContext;
  llm?: LLMService;
  passiveScanner?: SecurityReviewLab;
  activeTester?: AuthorizedSecurityTestingService;
  logger?: Logger;
  tasks?: TaskRepository;
  agents?: AgentRepository;
  taskId?: string;
  agentId?: string;
  conversationId?: string;
  authProfiles?: AuthorizedSecurityTestAuthProfile[];
  authEndpointDescriptors?: AuthorizedSecurityTestAuthEndpointDescriptorInput[];
  manualFormValidation?: AuthorizedSecurityManualFormValidationInput;
  maxPages?: number;
  maxRequests?: number;
  defaultProvider?: string;
  defaultModel?: string;
  now?: () => Date;
}

export interface CreatePenetrationTestOrchestratorInput {
  target: string;
  verificationId: string;
  runId?: string;
  actor: AccessContext;
  authProfiles?: AuthorizedSecurityTestAuthProfile[];
  authEndpointDescriptors?: AuthorizedSecurityTestAuthEndpointDescriptorInput[];
  manualFormValidation?: AuthorizedSecurityManualFormValidationInput;
  maxPages?: number;
  maxRequests?: number;
  taskId?: string;
  agentId?: string;
  conversationId?: string;
}

export class PenetrationTestOrchestratorFactory {
  constructor(
    private readonly dependencies: Omit<
      PenetrationTestOrchestratorDependencies,
      | "actor"
      | "authProfiles"
      | "maxPages"
      | "maxRequests"
      | "taskId"
      | "agentId"
      | "conversationId"
    >
  ) {}

  create(input: CreatePenetrationTestOrchestratorInput): PenetrationTestOrchestrator {
    return new PenetrationTestOrchestrator(input.target, input.verificationId, input.runId, {
      ...this.dependencies,
      actor: input.actor,
      authProfiles: input.authProfiles,
      authEndpointDescriptors: input.authEndpointDescriptors,
      manualFormValidation: input.manualFormValidation,
      maxPages: input.maxPages,
      maxRequests: input.maxRequests,
      taskId: input.taskId,
      agentId: input.agentId,
      conversationId: input.conversationId
    });
  }
}

export class PenetrationTestOrchestrator {
  private context: PenetrationTestContext;
  private llm: LLMService;
  private passiveScanner: SecurityReviewLab;
  private activeTester: AuthorizedSecurityTestingService;
  private eventEmitter: EventEmitter;
  private logger: Logger;
  private runId: string;

  private readonly actor?: AccessContext;
  private readonly tasks?: TaskRepository;
  private readonly agents?: AgentRepository;
  private readonly conversationId?: string;
  private readonly authProfiles: AuthorizedSecurityTestAuthProfile[];
  private readonly authEndpointDescriptors: AuthorizedSecurityTestAuthEndpointDescriptorInput[];
  private readonly manualFormValidation?: AuthorizedSecurityManualFormValidationInput;
  private readonly maxPages: number;
  private readonly maxRequests: number;
  private readonly defaultProvider: string;
  private readonly defaultModel: string;
  private readonly now: () => Date;
  private readonly configured: boolean;

  private readonly auditTrail: PenetrationTestAuditEntry[] = [];
  private readonly activeReports: AuthorizedSecurityTestReport[] = [];
  private readonly remediationEngine = new RemediationEngine();

  private taskId?: string;
  private agentId?: string;
  private remainingRequestBudget: number;
  private currentAttackBudget = 0;
  private lastExecutionReport?: AuthorizedSecurityTestReport;
  private lastReport?: PenetrationTestReport;

  constructor(
    target: string,
    verificationId: string,
    runId?: string,
    dependencies: PenetrationTestOrchestratorDependencies = {}
  ) {
    this.runId = runId?.trim() || randomUUID();
    this.logger =
      dependencies.logger ??
      pino({
        name: "penetration-test-orchestrator"
      });
    this.llm = dependencies.llm as LLMService;
    this.passiveScanner = dependencies.passiveScanner as SecurityReviewLab;
    this.activeTester = dependencies.activeTester as AuthorizedSecurityTestingService;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
    this.actor = dependencies.actor;
    this.tasks = dependencies.tasks;
    this.agents = dependencies.agents;
    this.taskId = dependencies.taskId;
    this.agentId = dependencies.agentId;
    this.conversationId = dependencies.conversationId;
    this.authProfiles = this.normalizeAuthProfiles(dependencies.authProfiles);
    this.authEndpointDescriptors = this.normalizeAuthEndpointDescriptors(
      dependencies.authEndpointDescriptors
    );
    this.manualFormValidation = dependencies.manualFormValidation
      ? {
          rateLimitPerMinute: dependencies.manualFormValidation.rateLimitPerMinute,
          credentialLabels: [
            ...(dependencies.manualFormValidation.credentialLabels ?? [])
          ],
          notes: dependencies.manualFormValidation.notes
        }
      : undefined;
    this.maxPages = this.normalizeMaxPages(dependencies.maxPages);
    this.maxRequests = this.normalizeMaxRequests(dependencies.maxRequests);
    this.remainingRequestBudget = this.maxRequests;
    this.defaultProvider = dependencies.defaultProvider ?? "default";
    this.defaultModel = dependencies.defaultModel ?? "default";
    this.now = dependencies.now ?? (() => new Date());
    this.configured = Boolean(
      dependencies.actor &&
        dependencies.llm &&
        dependencies.passiveScanner &&
        dependencies.activeTester
    );

    const normalizedTarget = this.normalizeTarget(target);
    this.context = {
      target: normalizedTarget,
      verificationId: verificationId.trim(),
      startTime: this.now(),
      reconData: null,
      vulnerabilities: [],
      attackPlan: this.createEmptyPlan(),
      executionResults: [],
      attackChains: [],
      evidence: [],
      decisions: [],
      currentPhase: "recon",
      isComplete: false
    };

    this.validateTarget();
    if (!this.context.verificationId) {
      throw new AppError("A verification ID is required.", 400);
    }
  }

  async run(): Promise<PenetrationTestReport> {
    this.assertRunnable();

    await this.createAuditLog("run.started", {
      target: this.context.target,
      verificationId: this.context.verificationId,
      guardrails: this.buildGuardrails()
    });
    this.emitEvent({
      type: "status",
      phase: this.context.currentPhase,
      message: "Penetration test run started.",
      data: {
        target: this.context.target,
        verificationId: this.context.verificationId
      }
    });

    try {
      await this.performReconnaissance();
      await this.analyzeAndPlan();
      await this.executeAttacks();
      this.context.currentPhase = "reporting";
      this.emitEvent({
        type: "phase",
        phase: "reporting",
        message: PHASE_DESCRIPTIONS.reporting,
        data: {
          title: PHASE_TITLES.reporting
        }
      });
      const report = await this.generateReport();
      this.context.currentPhase = "complete";
      this.context.isComplete = true;
      this.lastReport = report;
      await this.storeReport(report);
      await this.createAuditLog("run.completed", {
        reportId: report.id,
        vulnerabilityCount: report.vulnerabilities.length,
        chainCount: report.attackChains.length
      });
      this.emitEvent({
        type: "complete",
        phase: "complete",
        message: "Penetration test run completed.",
        data: {
          reportId: report.id,
          duration: report.duration
        }
      });
      return report;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Penetration test orchestration failed unexpectedly.";
      this.logger.error(
        {
          runId: this.runId,
          target: this.context.target,
          error
        },
        "Penetration test run failed"
      );
      await this.createAuditLog("run.failed", {
        message,
        phase: this.context.currentPhase
      });
      await this.persistState("failed", message);
      this.emitEvent({
        type: "error",
        phase: this.context.currentPhase,
        message,
        data: {
          error: message
        }
      });
      throw error;
    }
  }

  private async performReconnaissance(): Promise<void> {
    this.context.currentPhase = "recon";
    this.emitEvent({
      type: "phase",
      phase: "recon",
      message: PHASE_DESCRIPTIONS.recon,
      data: {
        title: PHASE_TITLES.recon
      }
    });
    await this.createAuditLog("phase.recon.started", {
      target: this.context.target,
      maxPages: this.maxPages
    });

    const scanResult = await this.passiveScanner.runReview(this.actor!, {
      url: this.context.target,
      maxPages: this.maxPages
    });

    this.context.reconData = scanResult;
    this.mergeVulnerabilities(this.extractVulnerabilitiesFromScan(scanResult));
    this.addEvidence("recon", "Passive reconnaissance completed.", {
      headline: scanResult.summary.headline,
      riskLevel: scanResult.summary.riskLevel,
      findings: scanResult.findings.length,
      attackPaths: scanResult.attackPaths.length,
      raw: scanResult
    });

    await this.createAuditLog("phase.recon.completed", {
      findings: scanResult.findings.length,
      vulnerabilities: this.context.vulnerabilities.length,
      riskLevel: scanResult.summary.riskLevel
    });
    this.emitEvent({
      type: "finding",
      phase: "recon",
      message: `Reconnaissance identified ${this.context.vulnerabilities.length} candidate vulnerabilities.`,
      data: {
        vulnerabilities: this.context.vulnerabilities.length
      }
    });
  }

  private async analyzeAndPlan(): Promise<void> {
    this.context.currentPhase = "planning";
    this.emitEvent({
      type: "phase",
      phase: "planning",
      message: PHASE_DESCRIPTIONS.planning,
      data: {
        title: PHASE_TITLES.planning
      }
    });
    await this.createAuditLog("phase.planning.started", {
      vulnerabilityCount: this.context.vulnerabilities.length
    });

    const candidateAttacks = this.buildCandidateAttacks();
    const executableAttackLimit = Math.max(
      1,
      Math.min(candidateAttacks.length, Math.floor(this.maxRequests / 6) || 1)
    );

    let plan: AttackPlan;
    try {
      const aiPlan = await this.llm.createStructuredOutput(
        this.defaultProvider,
        {
          model: this.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are coordinating an authorized white-hat penetration test. Plan only read-only, reversible validation steps. You may only use GET, HEAD, or OPTIONS based testing via the authorized testing service. Keep payload descriptions abstract and non-destructive."
            },
            {
              role: "user",
              content: JSON.stringify({
                target: this.context.target,
                verificationId: this.context.verificationId,
                guardrails: this.buildGuardrails(),
                authProfilesAvailable: this.authProfiles.map((profile) => ({
                  name: profile.name,
                  role: profile.role
                })),
                vulnerabilities: this.context.vulnerabilities.map((vulnerability) => ({
                  id: vulnerability.id,
                  type: vulnerability.type,
                  severity: vulnerability.severity,
                  location: vulnerability.location,
                  description: vulnerability.description,
                  confidence: vulnerability.confidence,
                  exploitable: vulnerability.exploitable
                })),
                candidateAttacks: candidateAttacks.map((attack) => ({
                  name: attack.name,
                  type: attack.type,
                  target: attack.target,
                  payload: attack.payload,
                  expectedOutcome: attack.expectedOutcome
                })),
                maximumAttacks: executableAttackLimit
              })
            }
          ]
        },
        ATTACK_PLAN_SCHEMA
      );

      plan = this.sanitizeAttackPlan({
        id: randomUUID(),
        name: aiPlan.name,
        description: aiPlan.description,
        attacks: aiPlan.attacks.map((attack) => ({
          id: randomUUID(),
          name: attack.name,
          type: attack.type,
          target: attack.target,
          payload: attack.payload,
          expectedOutcome: attack.expectedOutcome,
          status: "pending" as const
        })),
        priority: aiPlan.priority,
        estimatedSuccess: aiPlan.estimatedSuccess
      });
    } catch (error) {
      this.logger.warn(
        {
          runId: this.runId,
          target: this.context.target,
          error
        },
        "AI planning failed, using heuristic plan"
      );
      plan = this.buildHeuristicPlan(candidateAttacks, executableAttackLimit);
    }

    this.context.attackPlan = plan;
    const decision = this.recordDecision({
      action: `Plan ${plan.attacks.length} safe attack(s)`,
      reason: plan.description,
      confidence: plan.estimatedSuccess,
      alternative:
        "Stop after reconnaissance and report the passive findings without active validation."
    });
    this.addEvidence("plan", "Attack plan generated.", {
      plan,
      decisionId: decision.id
    });

    await this.createAuditLog("phase.planning.completed", {
      attackCount: plan.attacks.length,
      priority: plan.priority,
      estimatedSuccess: plan.estimatedSuccess
    });
    this.emitEvent({
      type: "decision",
      phase: "planning",
      message: `Planned ${plan.attacks.length} read-only attack path(s).`,
      data: {
        planId: plan.id,
        attacks: plan.attacks.map((attack) => attack.type),
        priority: plan.priority
      }
    });
  }

  private async executeAttacks(): Promise<void> {
    this.context.currentPhase = "execution";
    this.emitEvent({
      type: "phase",
      phase: "execution",
      message: PHASE_DESCRIPTIONS.execution,
      data: {
        title: PHASE_TITLES.execution,
        plannedAttacks: this.context.attackPlan.attacks.length
      }
    });
    await this.createAuditLog("phase.execution.started", {
      plannedAttacks: this.context.attackPlan.attacks.length,
      requestBudget: this.maxRequests
    });

    for (let index = 0; index < this.context.attackPlan.attacks.length; index += 1) {
      const attack = this.context.attackPlan.attacks[index];
      if (!attack) {
        continue;
      }

      if (attack.status !== "pending") {
        continue;
      }

      if (!this.isAttackSafe(attack)) {
        attack.status = "skipped";
        attack.result = "Skipped because the attack exceeded the read-only safety boundary.";
        attack.timestamp = this.now();
        await this.createAuditLog("attack.skipped.unsafe", {
          attackId: attack.id,
          attackType: attack.type,
          target: attack.target
        });
        this.emitEvent({
          type: "attack",
          phase: "execution",
          message: `Skipped unsafe attack ${attack.name}.`,
          data: {
            attackId: attack.id,
            status: attack.status
          }
        });
        continue;
      }

      if (this.remainingRequestBudget < 6) {
        attack.status = "skipped";
        attack.result = "Skipped because the remaining request budget was exhausted.";
        attack.timestamp = this.now();
        await this.createAuditLog("attack.skipped.budget", {
          attackId: attack.id,
          remainingBudget: this.remainingRequestBudget
        });
        continue;
      }

      const pendingIncludingCurrent = this.context.attackPlan.attacks.filter(
        (candidate) => candidate.status === "pending"
      ).length;
      this.currentAttackBudget = Math.max(
        6,
        Math.min(
          this.remainingRequestBudget,
          Math.floor(this.remainingRequestBudget / pendingIncludingCurrent)
        )
      );

      attack.status = "running";
      attack.timestamp = this.now();
      this.emitEvent({
        type: "attack",
        phase: "execution",
        message: `Running ${attack.name}.`,
        data: {
          attackId: attack.id,
          attackType: attack.type,
          requestBudget: this.currentAttackBudget
        }
      });
      await this.createAuditLog("attack.started", {
        attackId: attack.id,
        attackType: attack.type,
        requestBudget: this.currentAttackBudget
      });

      const result = await this.executeAttack(attack);
      const report = this.lastExecutionReport;
      const requestsSent = report?.summary.requestsSent ?? this.currentAttackBudget;
      this.remainingRequestBudget = Math.max(
        0,
        this.remainingRequestBudget - requestsSent
      );

      attack.status = result.success ? "success" : "failed";
      attack.result = result.message;
      attack.evidence = result.evidence;
      attack.timestamp = result.timestamp ?? this.now();

      const executionResult: ExecutionResult = {
        attackId: attack.id,
        attackName: attack.name,
        success: result.success,
        status: attack.status,
        message: result.message,
        evidence: result.evidence,
        vulnerability: result.vulnerability,
        timestamp: attack.timestamp,
        rawData: report
      };
      this.context.executionResults.push(executionResult);

      if (result.vulnerability) {
        this.mergeVulnerabilities([result.vulnerability]);
      }

      if (result.evidence) {
        this.addEvidence("execution", `${attack.name} executed.`, {
          attackId: attack.id,
          type: attack.type,
          success: result.success,
          evidence: result.evidence,
          raw: report
        });
      }

      const decision = await this.makeDecision(attack, result);
      await this.createAuditLog("attack.completed", {
        attackId: attack.id,
        attackType: attack.type,
        success: result.success,
        remainingBudget: this.remainingRequestBudget,
        decision: decision.action
      });
      this.emitEvent({
        type: "attack",
        phase: "execution",
        message: result.message,
        data: {
          attackId: attack.id,
          status: attack.status,
          success: result.success,
          remainingBudget: this.remainingRequestBudget
        }
      });

      const shouldStop =
        decision.action.toLowerCase().includes("skip remaining") ||
        decision.action.toLowerCase().includes("report only");
      if (shouldStop) {
        this.skipRemainingAttacks(
          "The AI decided the remaining attacks would add low value inside the current safety boundary."
        );
        break;
      }

      const shouldPrioritizeAuthorization =
        result.vulnerability?.type === "authentication" ||
        decision.action.toLowerCase().includes("advance chain");
      if (shouldPrioritizeAuthorization) {
        this.prioritizeNextAttack("authorization", index);
      }

      const shouldDeprioritizeType =
        !result.success && decision.action.toLowerCase().includes("deprioritize");
      if (shouldDeprioritizeType) {
        this.skipPendingAttacksOfType(
          attack.type,
          "A prior attack on the same surface failed and the AI deprioritized redundant checks."
        );
      }
    }

    await this.attemptChaining();
    await this.createAuditLog("phase.execution.completed", {
      executedAttacks: this.context.executionResults.length,
      successfulAttacks: this.context.executionResults.filter((result) => result.success).length,
      attackChains: this.context.attackChains.length
    });
  }

  private async executeAttack(attack: Attack): Promise<AttackResult> {
    const module = this.toAuthorizedModule(attack.type);
    if (!module) {
      return {
        success: false,
        message: `Attack type '${attack.type}' is not supported by the authorized testing engine.`,
        timestamp: this.now()
      };
    }

    try {
      const report = await this.activeTester.runAuthorizedSecurityTest(this.actor!, {
        verificationId: this.context.verificationId,
        url: this.context.target,
        maxPages: this.maxPages,
        maxRequests: this.currentAttackBudget,
        modules: [module],
        authProfiles:
          module === "authorization" || module === "authentication"
            ? this.authProfiles
            : this.authProfiles.filter((profile) => profile.role === "anonymous"),
        authEndpointDescriptors: this.authEndpointDescriptors,
        manualFormValidation: this.manualFormValidation
      });

      this.lastExecutionReport = report;
      this.activeReports.push(report);
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
      this.lastExecutionReport = undefined;
      const message =
        error instanceof Error
          ? error.message
          : "The authorized testing service failed to execute the attack.";
      this.logger.warn(
        {
          runId: this.runId,
          target: this.context.target,
          attackId: attack.id,
          attackType: attack.type,
          error
        },
        "Attack execution failed"
      );
      return {
        success: false,
        message,
        evidence: message,
        timestamp: this.now()
      };
    }
  }

  private async makeDecision(attack: Attack, result: AttackResult): Promise<Decision> {
    try {
      const output = await this.llm.createStructuredOutput(
        this.defaultProvider,
        {
          model: this.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are coordinating an authorized penetration test inside strict read-only boundaries. Decide only whether to continue, reprioritize, or stop. Do not propose destructive or out-of-scope actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                target: this.context.target,
                guardrails: this.buildGuardrails(),
                attack: {
                  id: attack.id,
                  name: attack.name,
                  type: attack.type,
                  target: attack.target,
                  expectedOutcome: attack.expectedOutcome
                },
                result,
                remainingAttacks: this.context.attackPlan.attacks
                  .filter((candidate) => candidate.status === "pending")
                  .map((candidate) => ({
                    id: candidate.id,
                    type: candidate.type,
                    name: candidate.name
                  })),
                knownVulnerabilities: this.context.vulnerabilities.map((vulnerability) => ({
                  id: vulnerability.id,
                  type: vulnerability.type,
                  severity: vulnerability.severity,
                  location: vulnerability.location
                }))
              })
            }
          ]
        },
        DECISION_SCHEMA
      );

      return this.recordDecision({
        action: output.action,
        reason: output.reason,
        confidence: output.confidence,
        alternative: output.alternative
      });
    } catch (error) {
      const fallbackDecision = result.success
        ? {
            action: "Advance chain and prioritize related authorization checks",
            reason:
              "A successful result suggests the adjacent privilege-boundary checks are the highest-value next step.",
            confidence: 0.78,
            alternative: "Continue the original attack order without reprioritization."
          }
        : {
            action: "Continue with the next distinct safe attack",
            reason:
              "The current result did not justify repeating the same surface, so breadth is higher value than redundancy.",
            confidence: 0.7,
            alternative: "Stop now and report only the completed validation."
          };

      this.logger.debug(
        {
          runId: this.runId,
          attackId: attack.id,
          error
        },
        "AI decision failed, using heuristic decision"
      );
      return this.recordDecision(fallbackDecision);
    }
  }

  private async attemptChaining(): Promise<void> {
    const chains = this.buildAttackChainsHeuristically();
    this.context.attackChains = chains;
    if (chains.length === 0) {
      await this.createAuditLog("attack.chaining.none", {
        vulnerabilityCount: this.context.vulnerabilities.length
      });
      return;
    }

    this.addEvidence("execution", "Attack chain analysis completed.", {
      chains
    });
    await this.createAuditLog("attack.chaining.completed", {
      chainCount: chains.length
    });
    this.emitEvent({
      type: "evidence",
      phase: "execution",
      message: `Built ${chains.length} attack chain(s).`,
      data: {
        chainCount: chains.length
      }
    });
  }

  private async generateReport(): Promise<PenetrationTestReport> {
    const endTime = this.now();
    const fallbackReport = this.buildFallbackReport(endTime);

    let executiveSummary = fallbackReport.executiveSummary;
    let narrative = fallbackReport.narrative;
    let impact = fallbackReport.impact;
    let recommendations = fallbackReport.recommendations;

    try {
      const report = await this.llm.createStructuredOutput(
        this.defaultProvider,
        {
          model: this.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "Write a professional white-hat penetration testing report. Keep the tone defensive and factual. Describe the attack story, but stay focused on safe validation, impact, and remediation."
            },
            {
              role: "user",
              content: JSON.stringify({
                target: this.context.target,
                verificationId: this.context.verificationId,
                guardrails: this.buildGuardrails(),
                reconSummary: this.context.reconData
                  ? {
                      headline: this.context.reconData.summary?.headline,
                      riskLevel: this.context.reconData.summary?.riskLevel,
                      findings: this.context.reconData.findings?.length ?? 0
                    }
                  : null,
                plan: {
                  priority: this.context.attackPlan.priority,
                  estimatedSuccess: this.context.attackPlan.estimatedSuccess,
                  attacks: this.context.attackPlan.attacks.map((attack) => ({
                    name: attack.name,
                    type: attack.type,
                    status: attack.status,
                    result: attack.result
                  }))
                },
                vulnerabilities: this.context.vulnerabilities,
                attackChains: this.context.attackChains,
                decisions: this.context.decisions.map((decision) => ({
                  action: decision.action,
                  reason: decision.reason,
                  confidence: decision.confidence
                }))
              })
            }
          ]
        },
        REPORT_SCHEMA
      );

      executiveSummary = report.executiveSummary;
      narrative = report.narrative;
      impact = report.impact;
      recommendations = this.uniqueStrings([
        ...report.recommendations,
        ...this.context.vulnerabilities.map((vulnerability) => vulnerability.remediation)
      ]).slice(0, 8);
    } catch (error) {
      this.logger.warn(
        {
          runId: this.runId,
          target: this.context.target,
          error
        },
        "AI report generation failed, using deterministic report"
      );
    }

    const reportEvidence = this.addEvidence("report", "Professional report generated.", {
      reportId: this.runId,
      recommendations: recommendations.length
    });
    const engagement = this.buildEngagementMetadata();
    const assurance = this.buildAssuranceSummary();
    const remediationPlan = this.remediationEngine.buildPlan(
      this.context.vulnerabilities,
      this.context.attackChains
    );

    const report: PenetrationTestReport = {
      id: this.runId,
      target: this.context.target,
      startTime: this.context.startTime,
      endTime,
      duration: Math.max(0, endTime.getTime() - this.context.startTime.getTime()),
      executiveSummary,
      narrative,
      engagement,
      assurance,
      remediationPlan,
      vulnerabilities: this.cloneSerializable(this.context.vulnerabilities),
      attackChains: this.cloneSerializable(this.context.attackChains),
      impact,
      recommendations,
      evidence: this.cloneSerializable([...this.context.evidence]),
      rawData: {
        runId: this.runId,
        taskId: this.taskId,
        agentId: this.agentId,
        context: this.cloneSerializable(this.context),
        activeReports: this.cloneSerializable(this.activeReports),
        auditTrail: this.cloneSerializable(this.auditTrail),
        guardrails: engagement.guardrails,
        requestBudgetRemaining: this.remainingRequestBudget
      }
    };
    await this.createAuditLog("phase.reporting.completed", {
      reportId: report.id,
      recommendationCount: report.recommendations.length,
      evidenceId: reportEvidence.id
    });
    this.emitEvent({
      type: "report",
      phase: "reporting",
      message: "Penetration test report generated.",
      data: {
        reportId: report.id,
        vulnerabilities: report.vulnerabilities.length,
        chains: report.attackChains.length
      }
    });

    return report;
  }

  private validateTarget(): void {
    const url = new URL(this.context.target);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new AppError("Only HTTP and HTTPS targets are supported.", 400);
    }

    if (!url.hostname) {
      throw new AppError("The target URL must include a hostname.", 400);
    }

    if (url.username || url.password) {
      throw new AppError("Targets with embedded credentials are not allowed.", 400);
    }
  }

  private isAttackSafe(attack: Attack): boolean {
    let targetOrigin: string;
    let attackOrigin: string;

    try {
      targetOrigin = new URL(this.context.target).origin;
      attackOrigin = new URL(attack.target).origin;
    } catch {
      return false;
    }

    if (attackOrigin !== targetOrigin) {
      return false;
    }

    if (!ALLOWED_ATTACK_TYPES.has(attack.type as AuthorizedSecurityTestModule)) {
      return false;
    }

    const haystack = `${attack.name} ${attack.payload} ${attack.expectedOutcome}`.toLowerCase();
    return !RISKY_ATTACK_TERMS.some((term) => haystack.includes(term));
  }

  private extractVulnerabilitiesFromScan(scanResult: any): Vulnerability[] {
    if (!scanResult || !Array.isArray(scanResult.findings)) {
      return [];
    }

    return scanResult.findings.map((finding: SecurityReviewFinding) =>
      this.toPassiveVulnerability(finding)
    );
  }

  private emitEvent(data: any): void {
    const event: PenetrationTestStreamEvent = {
      id: randomUUID(),
      runId: this.runId,
      target: this.context.target,
      phase: data.phase ?? this.context.currentPhase,
      type: data.type,
      message: data.message,
      timestamp: this.now().toISOString(),
      data: this.cloneSerializable(data.data ?? {})
    };

    this.eventEmitter.emit("update", event);
    this.eventEmitter.emit(event.type, event);
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  public async storeReport(report: PenetrationTestReport): Promise<void> {
    this.lastReport = report;
    await this.persistState("completed", report.executiveSummary, report);
  }

  private async createAuditLog(action: string, data: any): Promise<void> {
    const entry: PenetrationTestAuditEntry = {
      id: randomUUID(),
      action,
      data: this.cloneSerializable(data ?? {}),
      timestamp: this.now().toISOString()
    };

    this.auditTrail.push(entry);
    this.logger.info(
      {
        runId: this.runId,
        target: this.context.target,
        action,
        data: entry.data
      },
      "Penetration test audit event"
    );
    await this.persistState();
    this.emitEvent({
      type: "audit",
      phase: this.context.currentPhase,
      message: action,
      data: entry.data
    });
  }

  private assertRunnable(): void {
    if (!this.configured) {
      throw new AppError(
        "PenetrationTestOrchestrator requires an actor, LLMService, SecurityReviewLab, and AuthorizedSecurityTestingService dependencies.",
        500
      );
    }
  }

  private createEmptyPlan(): AttackPlan {
    return {
      id: randomUUID(),
      name: "Pending plan",
      description: "The attack plan will be populated after reconnaissance.",
      attacks: [],
      priority: "low",
      estimatedSuccess: 0
    };
  }

  private normalizeTarget(target: string): string {
    const trimmed = target.trim();
    if (!trimmed) {
      throw new AppError("A target URL is required.", 400);
    }

    const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(normalized);
    url.hash = "";
    return url.toString();
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

  private normalizeAuthEndpointDescriptors(
    descriptors?: AuthorizedSecurityTestAuthEndpointDescriptorInput[]
  ): AuthorizedSecurityTestAuthEndpointDescriptorInput[] {
    if (!descriptors || descriptors.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: AuthorizedSecurityTestAuthEndpointDescriptorInput[] = [];
    for (const descriptor of descriptors.slice(0, 6)) {
      const name = descriptor.name.trim();
      const endpoint = descriptor.endpoint.trim();
      if (!name || !endpoint || seen.has(endpoint.toLowerCase())) {
        continue;
      }

      seen.add(endpoint.toLowerCase());
      normalized.push({
        type: "auth_api",
        name,
        entryUrl: descriptor.entryUrl.trim(),
        endpoint,
        method: "POST",
        contentType: descriptor.contentType?.trim() || undefined,
        fields: descriptor.fields.map((field) => field.trim()).filter(Boolean),
        tokenFields:
          descriptor.tokenFields?.map((field) => field.trim()).filter(Boolean) ??
          undefined,
        stagingOnly: descriptor.stagingOnly,
        productionMode: descriptor.productionMode
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

  private buildGuardrails(): string[] {
    return [
      `Target origin must remain ${new URL(this.context.target).origin}.`,
      `Passive reconnaissance is capped at ${this.maxPages} page(s).`,
      `Active validation is capped at ${this.maxRequests} total request(s).`,
      "Declared auth endpoint descriptors are treated as discovery metadata only; the orchestrator does not submit credentials or replay tokens through them.",
      this.manualFormValidation
        ? `Manual POST validation notes are limited to labeled test credentials and the automated validator remains read-only while throttled to ${Math.max(1, Math.min(60, Math.trunc(this.manualFormValidation.rateLimitPerMinute ?? 5)))} request(s) per minute.`
        : undefined,
      "Only GET, HEAD, and OPTIONS based testing is allowed.",
      "No destructive actions, data modification, uploads, brute force, or persistence are permitted."
    ].filter((guardrail): guardrail is string => Boolean(guardrail));
  }

  private recordDecision(
    input: Omit<Decision, "id" | "timestamp">
  ): Decision {
    const decision: Decision = {
      id: randomUUID(),
      timestamp: this.now(),
      ...input
    };
    this.context.decisions.push(decision);
    this.emitEvent({
      type: "decision",
      phase: this.context.currentPhase,
      message: decision.action,
      data: {
        reason: decision.reason,
        confidence: decision.confidence,
        alternative: decision.alternative
      }
    });
    return decision;
  }

  private addEvidence(type: string, description: string, data: any): Evidence {
    const evidence: Evidence = {
      id: randomUUID(),
      type,
      description,
      data: this.cloneSerializable(data),
      timestamp: this.now()
    };
    this.context.evidence.push(evidence);
    this.emitEvent({
      type: "evidence",
      phase: this.context.currentPhase,
      message: description,
      data: {
        evidenceId: evidence.id,
        evidenceType: type
      }
    });
    return evidence;
  }

  private mergeVulnerabilities(vulnerabilities: Vulnerability[]): void {
    const current = new Map<string, Vulnerability>();
    for (const vulnerability of this.context.vulnerabilities) {
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

    this.context.vulnerabilities = Array.from(current.values()).sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });
  }

  private vulnerabilityKey(vulnerability: Vulnerability): string {
    return [
      vulnerability.type.toLowerCase(),
      vulnerability.location.toLowerCase(),
      vulnerability.description.toLowerCase()
    ].join("::");
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

  private buildCandidateAttacks(): Attack[] {
    const modules = this.deriveModulesFromVulnerabilities();
    return modules.map((module) => this.buildAttack(module));
  }

  private deriveModulesFromVulnerabilities(): AuthorizedSecurityTestModule[] {
    const modules = new Set<AuthorizedSecurityTestModule>();
    const text = this.context.vulnerabilities
      .map((vulnerability) =>
        `${vulnerability.type} ${vulnerability.location} ${vulnerability.description}`.toLowerCase()
      )
      .join("\n");

    if (/(admin|login|auth|credential|password|session|cookie)/.test(text)) {
      modules.add("authentication");
      modules.add("session_management");
    }

    if (/(csrf|xsrf|samesite)/.test(text)) {
      modules.add("csrf");
    }

    if (
      /(role|privilege|permission|authorization|access control|admin)/.test(text) &&
      this.hasDifferentialProfiles()
    ) {
      modules.add("authorization");
    }

    if (/(api|swagger|graphql|cors|json|endpoint|idor|exposure)/.test(text)) {
      modules.add("api_security");
    }

    if (/(oauth|oidc|openid|sso|authorize|redirect_uri)/.test(text)) {
      modules.add("oauth_flow");
      modules.add("open_redirect");
    }

    if (/(ssrf|server-side request forgery|proxy|webhook|url fetch|avatar|feed)/.test(text)) {
      modules.add("ssrf");
    }

    if (/(workflow|checkout|billing|payment|approval|coupon|discount|redeem|subscription|invite)/.test(text)) {
      modules.add("business_logic");
    }

    if (/(xss|script|csp|frame|client-side|dom)/.test(text)) {
      modules.add("xss");
    }

    if (/(sql|query|database|parameter|orm)/.test(text)) {
      modules.add("sql_injection");
    }

    if (/(waf|firewall|cdn|edge)/.test(text)) {
      modules.add("waf");
    }

    if (modules.size === 0) {
      modules.add("authentication");
      modules.add("api_security");
      modules.add("session_management");
    }

    return Array.from(modules).slice(0, 6);
  }

  private hasDifferentialProfiles(): boolean {
    return (
      this.authProfiles.some((profile) => profile.role === "high_privilege") &&
      this.authProfiles.some((profile) => profile.role !== "high_privilege")
    );
  }

  private buildAttack(module: AuthorizedSecurityTestModule): Attack {
    const focusVulnerability = this.context.vulnerabilities.find(
      (vulnerability) => this.mapVulnerabilityToModule(vulnerability) === module
    );
    const target = focusVulnerability?.location || this.context.target;

    switch (module) {
      case "authentication":
        return {
          id: randomUUID(),
          name: "Validate authentication boundaries",
          type: module,
          target,
          payload: "Anonymous and low-trust GET/HEAD requests against privileged-looking routes.",
          expectedOutcome: "Protected routes should reject or redirect unauthenticated requests.",
          status: "pending"
        };
      case "csrf":
        return {
          id: randomUUID(),
          name: "Review anti-CSRF boundaries",
          type: module,
          target,
          payload: "Read-only inspection of cookie-backed forms, token markers, and documented mutation flows.",
          expectedOutcome: "State-changing flows should expose strong anti-CSRF controls and safer SameSite defaults.",
          status: "pending"
        };
      case "authorization":
        return {
          id: randomUUID(),
          name: "Compare authorization boundaries",
          type: module,
          target,
          payload: "Read-only response comparison across low- and high-trust profiles.",
          expectedOutcome: "Lower-trust responses should lose access to privileged content.",
          status: "pending"
        };
      case "api_security":
        return {
          id: randomUUID(),
          name: "Probe public API exposure",
          type: module,
          target,
          payload: "Read-only discovery of exposed API routes, schemas, and permissive access patterns.",
          expectedOutcome: "API endpoints should enforce least privilege and safe data exposure.",
          status: "pending"
        };
      case "ssrf":
        return {
          id: randomUUID(),
          name: "Inspect URL-handling retrieval paths",
          type: module,
          target,
          payload: "Read-only same-origin URL probes against fetch-style features and webhook-like endpoints.",
          expectedOutcome: "User-controlled URL inputs should not trigger arbitrary server-side retrieval behavior.",
          status: "pending"
        };
      case "open_redirect":
        return {
          id: randomUUID(),
          name: "Check redirect boundaries",
          type: module,
          target,
          payload: "Read-only off-origin redirect targets against redirect-style parameters and SSO routes.",
          expectedOutcome: "Redirect handlers should reject or normalize unsafe off-origin destinations.",
          status: "pending"
        };
      case "business_logic":
        return {
          id: randomUUID(),
          name: "Validate workflow business rules",
          type: module,
          target,
          payload: "Read-only comparison of workflow-step, billing, and approval views across safe input variants.",
          expectedOutcome: "Workflow progression should stay server-driven and role-aware.",
          status: "pending"
        };
      case "oauth_flow":
        return {
          id: randomUUID(),
          name: "Review OAuth and OIDC flows",
          type: module,
          target,
          payload: "Read-only inspection of authorization metadata, authorize entry points, and redirect_uri handling.",
          expectedOutcome: "OAuth flows should use strong redirect validation and modern authorization patterns.",
          status: "pending"
        };
      case "session_management":
        return {
          id: randomUUID(),
          name: "Inspect session handling",
          type: module,
          target,
          payload: "Read-only inspection of cookies, token handling, and session transitions.",
          expectedOutcome: "Session controls should enforce secure flags and privilege separation.",
          status: "pending"
        };
      case "xss":
        return {
          id: randomUUID(),
          name: "Validate client-side reflection safety",
          type: module,
          target,
          payload: "Inert reflection checks and browser-surface validation with non-persistent input.",
          expectedOutcome: "Reflected content should be neutralized or safely encoded.",
          status: "pending"
        };
      case "sql_injection":
        return {
          id: randomUUID(),
          name: "Check query-driven inputs safely",
          type: module,
          target,
          payload: "Benign differential input probes that stay read-only and avoid data extraction.",
          expectedOutcome: "Input handling should behave consistently without backend query anomalies.",
          status: "pending"
        };
      case "waf":
        return {
          id: randomUUID(),
          name: "Assess edge filtering consistency",
          type: module,
          target,
          payload: "Read-only normalization and perimeter-response checks across harmless variants.",
          expectedOutcome: "The edge should respond consistently without exposing unsafe bypass signals.",
          status: "pending"
        };
      default:
        return {
          id: randomUUID(),
          name: "Run safe authorized validation",
          type: module,
          target,
          payload: "Read-only validation through the authorized testing engine.",
          expectedOutcome: "The target should enforce the expected security boundary.",
          status: "pending"
        };
    }
  }

  private buildHeuristicPlan(
    candidateAttacks: Attack[],
    executableAttackLimit: number
  ): AttackPlan {
    const sortedAttacks = [...candidateAttacks]
      .sort((left, right) => this.attackPriorityScore(right) - this.attackPriorityScore(left))
      .slice(0, executableAttackLimit);

    return {
      id: randomUUID(),
      name: "Heuristic safe attack plan",
      description:
        "The orchestrator prioritized the highest-value read-only modules from reconnaissance because AI planning was unavailable.",
      attacks: sortedAttacks,
      priority: sortedAttacks.some((attack) => attack.type === "authentication" || attack.type === "authorization")
        ? "high"
        : "medium",
      estimatedSuccess:
        sortedAttacks.length === 0
          ? 0
          : Number(Math.min(0.9, 0.45 + sortedAttacks.length * 0.1).toFixed(2))
    };
  }

  private sanitizeAttackPlan(plan: AttackPlan): AttackPlan {
    const limit = Math.max(1, Math.floor(this.maxRequests / 6) || 1);
    const attacks = plan.attacks
      .map((attack) => ({
        ...attack,
        target: this.normalizeAttackTarget(attack.target),
        payload: this.safeText(attack.payload),
        expectedOutcome: this.safeText(attack.expectedOutcome),
        status: "pending" as const
      }))
      .filter((attack) => {
        if (attack.type === "authorization" && !this.hasDifferentialProfiles()) {
          return false;
        }

        return this.isAttackSafe(attack);
      })
      .slice(0, limit);

    if (attacks.length === 0) {
      return this.buildHeuristicPlan(this.buildCandidateAttacks(), limit);
    }

    return {
      ...plan,
      attacks,
      estimatedSuccess: Math.max(0, Math.min(1, plan.estimatedSuccess))
    };
  }

  private normalizeAttackTarget(target: string): string {
    try {
      const base = new URL(this.context.target);
      const candidate = new URL(target, base);
      if (candidate.origin !== base.origin) {
        return base.toString();
      }

      return candidate.toString();
    } catch {
      return this.context.target;
    }
  }

  private safeText(value: string): string {
    let safeValue = value.trim().replace(/\s+/g, " ");
    for (const term of RISKY_ATTACK_TERMS) {
      safeValue = safeValue.replace(new RegExp(term, "gi"), "read-only");
    }

    return safeValue.slice(0, 280);
  }

  private attackPriorityScore(attack: Attack): number {
    switch (attack.type) {
      case "authentication":
      case "authorization":
        return 100;
      case "business_logic":
        return 96;
      case "oauth_flow":
        return 88;
      case "api_security":
        return 80;
      case "csrf":
        return 78;
      case "session_management":
        return 75;
      case "ssrf":
        return 74;
      case "sql_injection":
        return 70;
      case "xss":
        return 65;
      case "open_redirect":
        return 60;
      case "waf":
        return 55;
      default:
        return 50;
    }
  }

  private toAuthorizedModule(type: string): AuthorizedSecurityTestModule | null {
    if (ALLOWED_ATTACK_TYPES.has(type as AuthorizedSecurityTestModule)) {
      return type as AuthorizedSecurityTestModule;
    }

    return null;
  }

  private toPassiveVulnerability(finding: SecurityReviewFinding): Vulnerability {
    return {
      id: finding.id,
      type: this.mapSecurityReviewCategoryToType(finding.category),
      severity: this.mapPassiveSeverity(finding.severity),
      location: finding.pageUrl ?? this.context.target,
      description: finding.summary,
      evidence: finding.evidence.join("; "),
      remediation: finding.remediation,
      confidence: this.mapConfidence(finding.confidence),
      exploitable: false
    };
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

  private mapSecurityReviewCategoryToType(category: string): string {
    switch (category) {
      case "forms":
      case "authentication":
        return "authentication";
      case "authorization":
        return "authorization";
      case "api":
        return "api_security";
      case "headers":
      case "cookies":
        return "session_management";
      default:
        return category;
    }
  }

  private mapPassiveSeverity(
    severity: "low" | "medium" | "high"
  ): Vulnerability["severity"] {
    return severity;
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

  private mapVulnerabilityToModule(
    vulnerability: Vulnerability
  ): AuthorizedSecurityTestModule | null {
    if (ALLOWED_ATTACK_TYPES.has(vulnerability.type as AuthorizedSecurityTestModule)) {
      return vulnerability.type as AuthorizedSecurityTestModule;
    }

    const text = `${vulnerability.type} ${vulnerability.description}`.toLowerCase();
    if (/(auth|login|session|cookie)/.test(text)) {
      return "authentication";
    }

    if (/(csrf|xsrf|samesite)/.test(text)) {
      return "csrf";
    }

    if (/(role|privilege|authorization|access control)/.test(text)) {
      return "authorization";
    }

    if (/(business logic|workflow|checkout|billing|payment|approval|coupon|discount|redeem|subscription|invite)/.test(text)) {
      return "business_logic";
    }

    if (/(api|swagger|graphql|json)/.test(text)) {
      return "api_security";
    }

    if (/(oauth|oidc|openid|sso|authorize)/.test(text)) {
      return "oauth_flow";
    }

    if (/(redirect|redirect_uri|returnurl|callback)/.test(text)) {
      return "open_redirect";
    }

    if (/(ssrf|server-side request forgery|proxy|webhook|fetch url)/.test(text)) {
      return "ssrf";
    }

    if (/(script|xss|dom|csp)/.test(text)) {
      return "xss";
    }

    if (/(sql|query|database)/.test(text)) {
      return "sql_injection";
    }

    return null;
  }

  private buildAttackChainsHeuristically(): AttackChain[] {
    const chains: AttackChain[] = [];
    const passiveAdminSurface = this.context.vulnerabilities.find(
      (vulnerability) =>
        vulnerability.exploitable === false &&
        /(admin|privileged|protected)/i.test(
          `${vulnerability.location} ${vulnerability.description}`
        )
    );
    const authentication = this.context.vulnerabilities.find(
      (vulnerability) => vulnerability.type === "authentication" && vulnerability.exploitable
    );
    const authorization = this.context.vulnerabilities.find(
      (vulnerability) => vulnerability.type === "authorization" && vulnerability.exploitable
    );
    const apiExposure = this.context.vulnerabilities.find(
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

  private buildFallbackReport(endTime: Date): PenetrationTestReport {
    const highestSeverity = this.context.vulnerabilities[0]?.severity ?? "low";
    const successfulAttacks = this.context.executionResults.filter((result) => result.success);
    const attackStory =
      this.context.attackChains[0]?.steps
        .map((step) => `Step ${step.step}: ${step.action} ${step.result}`)
        .join(" ")
        ?? "The orchestrator moved from passive reconnaissance to guarded active validation within a strict read-only boundary.";
    const engagement = this.buildEngagementMetadata();
    const assurance = this.buildAssuranceSummary();
    const remediationPlan = this.remediationEngine.buildPlan(
      this.context.vulnerabilities,
      this.context.attackChains
    );

    return {
      id: this.runId,
      target: this.context.target,
      startTime: this.context.startTime,
      endTime,
      duration: Math.max(0, endTime.getTime() - this.context.startTime.getTime()),
      executiveSummary: `The orchestrated penetration test identified ${this.context.vulnerabilities.length} vulnerability signal(s) and confirmed ${successfulAttacks.length} guarded active validation path(s) against ${this.context.target}.`,
      narrative: attackStory,
      engagement,
      assurance,
      remediationPlan,
      vulnerabilities: this.cloneSerializable(this.context.vulnerabilities),
      attackChains: this.cloneSerializable(this.context.attackChains),
      impact: this.describeImpact(highestSeverity),
      recommendations: this.uniqueStrings(
        this.context.vulnerabilities.map((vulnerability) => vulnerability.remediation)
      ).slice(0, 8),
      evidence: this.cloneSerializable(this.context.evidence),
      rawData: {
        runId: this.runId,
        context: this.cloneSerializable(this.context),
        auditTrail: this.cloneSerializable(this.auditTrail)
      }
    };
  }

  private buildEngagementMetadata(): PenetrationTestEngagementMetadata {
    const targetUrl = new URL(this.context.target);
    const manualFormValidation =
      this.manualFormValidation &&
      (this.manualFormValidation.credentialLabels?.length ?? 0) > 0
        ? {
            enabled: true as const,
            rateLimitPerMinute: Math.max(
              1,
              Math.min(
                60,
                Math.trunc(this.manualFormValidation.rateLimitPerMinute ?? 5)
              )
            ),
            credentialLabels: [
              ...(this.manualFormValidation.credentialLabels ?? [])
            ],
            ...(this.manualFormValidation.notes?.trim()
              ? {
                  notes: this.manualFormValidation.notes.trim()
                }
              : {})
          }
        : undefined;

    return {
      targetOrigin: targetUrl.origin,
      verificationId: this.context.verificationId,
      passivePageLimit: this.maxPages,
      requestBudget: this.maxRequests,
      authProfiles: this.authProfiles.map((profile) => profile.name),
      declaredAuthEndpoints: this.authEndpointDescriptors.length,
      guardrails: this.buildGuardrails(),
      manualFormValidation
    };
  }

  private buildAssuranceSummary(): PenetrationTestAssuranceSummary {
    return {
      readOnlyOnly: true,
      sameOriginOnly: true,
      auditTrailEntries: this.auditTrail.length,
      evidenceItems: this.context.evidence.length,
      decisions: this.context.decisions.length,
      successfulValidations: this.context.executionResults.filter(
        (result) => result.success
      ).length,
      attackChainCount: this.context.attackChains.length
    };
  }

  private describeImpact(severity: Vulnerability["severity"]): string {
    switch (severity) {
      case "critical":
        return "The confirmed attack path creates a critical privilege or data-exposure risk that should be remediated immediately.";
      case "high":
        return "The confirmed findings materially weaken application trust boundaries and should be remediated on the next urgent fix cycle.";
      case "medium":
        return "The findings increase attacker leverage and should be remediated before adjacent weaknesses make them easier to chain.";
      default:
        return "The current findings are lower-risk individually, but they still expand attacker understanding of the target.";
    }
  }

  private skipRemainingAttacks(reason: string): void {
    for (const attack of this.context.attackPlan.attacks) {
      if (attack.status === "pending") {
        attack.status = "skipped";
        attack.result = reason;
        attack.timestamp = this.now();
      }
    }
  }

  private skipPendingAttacksOfType(type: string, reason: string): void {
    for (const attack of this.context.attackPlan.attacks) {
      if (attack.status === "pending" && attack.type === type) {
        attack.status = "skipped";
        attack.result = reason;
        attack.timestamp = this.now();
      }
    }
  }

  private prioritizeNextAttack(type: string, afterIndex: number): void {
    const attacks = this.context.attackPlan.attacks;
    const nextIndex = attacks.findIndex(
      (attack, index) =>
        index > afterIndex &&
        attack.status === "pending" &&
        attack.type === type
    );
    if (nextIndex <= afterIndex + 1 || nextIndex === -1) {
      return;
    }

    const [attack] = attacks.splice(nextIndex, 1);
    if (!attack) {
      return;
    }

    attacks.splice(afterIndex + 1, 0, attack);
  }

  private async persistState(
    statusOverride?: TaskEntity["status"],
    result?: string,
    report?: PenetrationTestReport
  ): Promise<void> {
    const task = await this.ensureTask();
    if (!task || !this.tasks) {
      return;
    }

    await this.tasks.updateState(task.id, {
      status: statusOverride ?? this.mapTaskStatus(),
      result,
      metadata: this.buildTaskMetadata(report ?? this.lastReport)
    });
  }

  private async ensureTask(): Promise<{ id: string } | null> {
    if (!this.tasks || !this.actor) {
      return null;
    }

    if (!this.agentId) {
      if (!this.agents) {
        return null;
      }

      const agent = await this.agents.create({
        workspaceId: this.actor.workspaceId,
        userId: this.actor.userId,
        name: "Penetration Test Orchestrator",
        description:
          "Coordinates passive review, AI planning, authorized active validation, and final reporting.",
        instructions:
          "Stay strictly read-only, reversible, and inside verified scope at all times.",
        enabledTools: []
      });
      this.agentId = agent.id;
    }

    if (!this.taskId) {
      const task = await this.tasks.create({
        workspaceId: this.actor.workspaceId,
        agentId: this.agentId,
        conversationId: this.conversationId,
        title: `Penetration test: ${new URL(this.context.target).hostname}`,
        objective: `Run an AI-guided penetration test against ${this.context.target}.`,
        status: this.mapTaskStatus(),
        metadata: this.buildTaskMetadata(this.lastReport)
      });
      this.taskId = task.id;
      return {
        id: task.id
      };
    }

    return {
      id: this.taskId
    };
  }

  private buildTaskMetadata(
    report?: PenetrationTestReport
  ): PenetrationTestTaskMetadata {
    return {
      steps: this.buildTaskSteps(),
      executedTools: this.buildExecutedTools(),
      reasoningLog: this.auditTrail.map(
        (entry) => `[${entry.timestamp}] ${entry.action} ${JSON.stringify(entry.data)}`
      ),
      finalSummary: report?.executiveSummary,
      lastUpdatedAt: this.now().toISOString(),
      penetrationTest: {
        runId: this.runId,
        context: this.cloneSerializable(this.context),
        auditTrail: this.cloneSerializable(this.auditTrail),
        report: report ? this.cloneSerializable(report) : undefined,
        taskId: this.taskId,
        agentId: this.agentId
      }
    };
  }

  private buildTaskSteps(): TaskStepTrace[] {
    return (["recon", "planning", "execution", "reporting"] as const).map((phase) => ({
      id: `penetration-test-${phase}`,
      title: PHASE_TITLES[phase],
      rationale: PHASE_DESCRIPTIONS[phase],
      status: this.resolveTaskStepStatus(phase),
      startedAt: this.context.startTime.toISOString(),
      finishedAt:
        this.resolveTaskStepStatus(phase) === "completed" ||
        this.context.currentPhase === "complete"
          ? this.now().toISOString()
          : undefined,
      note: this.resolveTaskStepNote(phase)
    }));
  }

  private resolveTaskStepStatus(
    phase: "recon" | "planning" | "execution" | "reporting"
  ): TaskStepStatus {
    if (this.context.isComplete) {
      return "completed";
    }

    switch (phase) {
      case "recon":
        if (this.context.reconData) {
          return "completed";
        }
        break;
      case "planning":
        if (this.context.attackPlan.attacks.length > 0) {
          return "completed";
        }
        break;
      case "execution":
        if (this.context.executionResults.length > 0 || this.context.attackChains.length > 0) {
          return "completed";
        }
        break;
      case "reporting":
        if (this.lastReport) {
          return "completed";
        }
        break;
      default:
        break;
    }

    return this.context.currentPhase === phase ? "running" : "pending";
  }

  private resolveTaskStepNote(
    phase: "recon" | "planning" | "execution" | "reporting"
  ): string | undefined {
    switch (phase) {
      case "recon":
        return this.context.reconData
          ? `${this.context.vulnerabilities.length} candidate vulnerabilities extracted from reconnaissance.`
          : undefined;
      case "planning":
        return this.context.attackPlan.attacks.length > 0
          ? `${this.context.attackPlan.attacks.length} read-only attacks planned.`
          : undefined;
      case "execution":
        return this.context.executionResults.length > 0
          ? `${this.context.executionResults.length} attacks executed, ${this.context.attackChains.length} chain(s) built.`
          : undefined;
      case "reporting":
        return this.lastReport
          ? `${this.lastReport.vulnerabilities.length} vulnerabilities in final report.`
          : undefined;
      default:
        return undefined;
    }
  }

  private buildExecutedTools(): string[] {
    const tools = new Set<string>();
    if (this.context.reconData) {
      tools.add("security-review-lab");
    }
    if (this.context.attackPlan.attacks.length > 0 || this.context.decisions.length > 0) {
      tools.add("llm");
    }
    if (this.context.executionResults.length > 0) {
      tools.add("authorized-security-testing");
    }
    return Array.from(tools);
  }

  private mapTaskStatus(): TaskEntity["status"] {
    if (this.context.isComplete) {
      return "completed";
    }

    return this.auditTrail.length === 0 ? "queued" : "running";
  }

  private uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(normalized);
    }

    return result;
  }

  private cloneSerializable<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
  }
}
