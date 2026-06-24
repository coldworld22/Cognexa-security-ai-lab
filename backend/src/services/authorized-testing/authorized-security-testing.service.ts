import { lookup, resolveTxt } from "dns/promises";
import { createHash, randomBytes, randomUUID } from "crypto";
import { isIP } from "net";

import { z } from "zod";

import { AccessContext } from "../../authorization/authorization.types";
import { AuthorizedDomainVerificationEntity } from "../../database/entities/authorized-domain-verification.entity";
import { AuthorizedSecurityTestEventEntity } from "../../database/entities/authorized-security-test-event.entity";
import { AuthorizedSecurityTestRunEntity } from "../../database/entities/authorized-security-test-run.entity";
import { AuthorizedDomainVerificationRepository } from "../../database/repositories/authorized-domain-verification.repository";
import { AuthorizedSecurityTestEventRepository } from "../../database/repositories/authorized-security-test-event.repository";
import { AuthorizedSecurityTestRunRepository } from "../../database/repositories/authorized-security-test-run.repository";
import { AppError } from "../../utils/app-error";
import { AuthorizationService } from "../authorization/authorization.service";
import { LLMService } from "../llm/llm.service";
import { PolicyService } from "../policy/policy.service";
import {
  WebsiteScanResult,
  WebsiteScannerService
} from "../website-scanner/website-scanner.service";
import {
  AUTHORIZED_SECURITY_TEST_MODULES,
  AuthorizedApiFindingDetails,
  AuthorizedTestingDevModeStatus,
  AuthorizedApiVulnerabilityType,
  AuthorizedSecurityAdaptationDecision,
  AuthorizedSecurityAiAnalysis,
  AuthorizedSecurityAttackPath,
  AuthorizedSecurityAttackPathStatus,
  AuthorizedSecurityBaseline,
  AuthorizedSecurityCampaignStory,
  AuthorizedSecurityFinding,
  AuthorizedSecurityFindingDisposition,
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityModulePriority,
  AuthorizedSecurityPrediction,
  AuthorizedSecurityRiskLevel,
  AuthorizedSecurityPlanStep,
  AuthorizedSecurityTestAuthProfile,
  AuthorizedSecurityTestAuthProfileSummary,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunSummary,
  DomainOwnershipVerificationSummary,
  DomainOwnershipVerificationMethod,
  RunAuthorizedSecurityTestRequest,
  StartDomainOwnershipVerificationRequest,
  AuthorizedSecurityTestSummary
} from "./authorized-security-testing.types";
import {
  VerificationBypassDecision,
  VerificationBypassService
} from "./verification-bypass.service";

interface AuthorizedSecurityTestingServiceOptions {
  defaultProvider: string;
  defaultModel: string;
  allowDevelopmentLocalTargets?: boolean;
  fetchImpl?: typeof fetch;
  lookupHost?: typeof lookup;
  resolveTxtImpl?: typeof resolveTxt;
  now?: () => Date;
  verificationBypass?: VerificationBypassService;
}

interface ChallengeDescriptor {
  protocol: "http:" | "https:";
  challengeDetails: Record<string, unknown>;
  instructions: string[];
}

interface ProbeResponseSummary {
  eventId: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  headers: Headers;
  body: string;
  bodyHash: string;
}

interface ModuleExecutionResult {
  findings: AuthorizedSecurityFinding[];
  warnings: string[];
}

interface AdaptiveFollowUpPlan {
  decisions: AuthorizedSecurityAdaptationDecision[];
  steps: AuthorizedSecurityPlanStep[];
}

interface AdaptiveDecisionCandidate {
  module: AuthorizedSecurityTestModule;
  rationale: string;
  triggerFindingIds: string[];
  urgency: "low" | "medium" | "high";
}

interface RunState {
  runId: string;
  requestedUrl: URL;
  maxRequests: number;
  requestsSent: number;
  moduleWarnings: string[];
  moduleConcurrency: number;
  probeCacheHits: number;
  probeCacheMisses: number;
  adaptiveBackoffCount: number;
  rateLimitedResponses: number;
  networkRequestsSent: number;
  probeCache: Map<string, ProbeResponseSummary>;
  pendingProbeCache: Map<string, Promise<ProbeResponseSummary | null>>;
  requestReservationQueue: Promise<void>;
  nextAllowedProbeAt: number;
}

const AI_PLAN_SCHEMA = z.object({
  steps: z
    .array(
      z.object({
        category: z.enum(AUTHORIZED_SECURITY_TEST_MODULES),
        title: z.string().min(1),
        objective: z.string().min(1),
        safeMethod: z.string().min(1),
        stopConditions: z.array(z.string().min(1)).min(1).max(4)
      })
    )
    .min(1)
    .max(8)
});

const AI_ANALYSIS_SCHEMA = z.object({
  headline: z.string().min(1),
  executiveSummary: z.string().min(1),
  nextSteps: z.array(z.string().min(1)).min(1).max(6)
});

const AI_ADAPTATION_SCHEMA = z.object({
  decisions: z
    .array(
      z.object({
        module: z.enum(AUTHORIZED_SECURITY_TEST_MODULES),
        rationale: z.string().min(1),
        triggerFindingIds: z.array(z.string().min(1)).max(8),
        urgency: z.enum(["low", "medium", "high"])
      })
    )
    .max(3)
});

const AI_FINDING_VALIDATION_SCHEMA = z.object({
  validations: z
    .array(
      z.object({
        findingId: z.string().min(1),
        disposition: z.enum(["confirmed", "needs_review", "unlikely"]),
        confidence: z.number().int().min(0).max(100),
        rationale: z.string().min(1)
      })
    )
    .max(24)
});

const AI_PREDICTION_SCHEMA = z.object({
  predictions: z
    .array(
      z.object({
        category: z.enum(AUTHORIZED_SECURITY_TEST_MODULES),
        title: z.string().min(1),
        likelihood: z.enum(["low", "medium", "high"]),
        rationale: z.string().min(1),
        indicators: z.array(z.string().min(1)).min(1).max(4),
        recommendedCheck: z.string().min(1)
      })
    )
    .max(8)
});

const AI_ATTACK_PATH_SCHEMA = z.object({
  attackPaths: z
    .array(
      z.object({
        title: z.string().min(1),
        status: z.enum(["blocked", "constrained", "exposed"]),
        narrative: z.string().min(1),
        supportingFindingIds: z.array(z.string().min(1)).max(8),
        remediationPriority: z.enum(["immediate", "next", "hardening"]),
        safeValidation: z.string().min(1),
        confidence: z.number().int().min(0).max(100)
      })
    )
    .max(6)
});

const MODULE_PRIORITY_BASE_SCORES: Record<AuthorizedSecurityTestModule, number> = {
  sql_injection: 52,
  xss: 48,
  authentication: 50,
  authorization: 50,
  api_security: 46,
  waf: 40,
  session_management: 54
};

export class AuthorizedSecurityTestingService {
  private readonly allowDevelopmentLocalTargets: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly lookupHost: typeof lookup;
  private readonly resolveTxtImpl: typeof resolveTxt;
  private readonly now: () => Date;
  private readonly verificationBypass: VerificationBypassService;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly policy: PolicyService,
    private readonly websiteScanner: WebsiteScannerService,
    private readonly llm: LLMService,
    private readonly verifications: AuthorizedDomainVerificationRepository,
    private readonly runs: AuthorizedSecurityTestRunRepository,
    private readonly events: AuthorizedSecurityTestEventRepository,
    private readonly options: AuthorizedSecurityTestingServiceOptions
  ) {
    this.allowDevelopmentLocalTargets =
      options.allowDevelopmentLocalTargets === true;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookupHost = options.lookupHost ?? lookup;
    this.resolveTxtImpl = options.resolveTxtImpl ?? resolveTxt;
    this.now = options.now ?? (() => new Date());
    this.verificationBypass =
      options.verificationBypass ?? new VerificationBypassService();
  }

  async startDomainVerification(
    actor: AccessContext,
    input: StartDomainOwnershipVerificationRequest
  ): Promise<DomainOwnershipVerificationSummary> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.domain-verification",
      action: "start_domain_verification",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const method = input.method ?? "dns_txt";
    const { url } = this.normalizeRequestedUrl(input.target);
    const targetSafety = await this.classifyTargetUrl(url);
    const bypassDecision = this.verificationBypass.evaluate(
      url,
      input.devModeBypass
    );
    await this.policy.evaluatePolicy({
      actor,
      action: "admin.authorized_testing.verify_domain",
      categories: ["external_url_access", "security_research"],
      content: "Authorized domain ownership verification",
      url: url.toString(),
      metadata: {
        activeTesting: true,
        verificationOnly: true,
        method,
        devModeBypassRequested: input.devModeBypass === true
      }
    });

    const now = this.now();
    const challengeToken = randomBytes(18).toString("hex");
    const verificationMode =
      targetSafety.mode === "development_local"
        ? "development_local"
        : bypassDecision.active
          ? "development_bypass"
          : "standard";
    const developmentLocalEvidence =
      targetSafety.mode === "development_local"
        ? targetSafety.evidence
        : undefined;
    const challenge =
      verificationMode === "development_local"
        ? this.buildDevelopmentLocalChallenge(
            url,
            method,
            challengeToken,
            developmentLocalEvidence ?? {}
          )
        : verificationMode === "development_bypass"
          ? this.buildDevelopmentBypassChallenge(
              url,
              method,
              challengeToken,
              bypassDecision
            )
          : this.buildChallenge(url, method, challengeToken);
    const expiresAt = this.addHours(
      now,
      verificationMode === "standard" ? 24 : 12
    ).toISOString();
    const entity = await this.verifications.create({
      workspaceId: actor.workspaceId,
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      hostname: url.hostname,
      method,
      status: verificationMode === "standard" ? "pending" : "verified",
      challengeToken,
      challengeDetails: challenge.challengeDetails,
      evidence:
        verificationMode === "development_local"
          ? developmentLocalEvidence
          : verificationMode === "development_bypass"
            ? this.buildDevelopmentBypassEvidence(url, bypassDecision)
            : undefined,
      expiresAt
    });

    if (verificationMode !== "standard") {
      const verified = await this.verifications.updateStatus(entity.id, {
        status: "verified",
        evidence:
          verificationMode === "development_local"
            ? developmentLocalEvidence
            : this.buildDevelopmentBypassEvidence(url, bypassDecision),
        lastCheckedAt: now.toISOString(),
        verifiedAt: now.toISOString(),
        expiresAt
      });

      return this.toVerificationSummary(verified, challenge.instructions);
    }

    return this.toVerificationSummary(entity, challenge.instructions);
  }

  async checkDomainVerification(
    actor: AccessContext,
    verificationId: string,
    devModeBypass = false
  ): Promise<DomainOwnershipVerificationSummary> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: `admin.authorized-testing.domain-verification.${verificationId}`,
      action: "check_domain_verification",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const verification = await this.getWorkspaceVerification(actor, verificationId);
    const challenge = this.buildChallenge(
      new URL(`https://${verification.hostname}/`),
      verification.method,
      verification.challengeToken,
      verification.challengeDetails
    );
    const isDevelopmentLocalVerification =
      this.isDevelopmentLocalVerification(verification);
    const isDevelopmentBypassVerification =
      this.isDevelopmentBypassVerification(verification);

    if (isDevelopmentLocalVerification) {
      const now = this.now();
      if (!this.allowDevelopmentLocalTargets) {
        const disabled = await this.verifications.updateStatus(verification.id, {
          status: "failed",
          lastCheckedAt: now.toISOString(),
          evidence: {
            ...verification.evidence,
            reason: "development_local_mode_disabled"
          }
        });

        return this.toVerificationSummary(disabled, challenge.instructions);
      }

      const refreshed = await this.verifications.updateStatus(verification.id, {
        status: "verified",
        evidence: verification.evidence,
        lastCheckedAt: now.toISOString(),
        verifiedAt: verification.verifiedAt ?? now.toISOString(),
        expiresAt: this.addHours(now, 12).toISOString()
      });

      return this.toVerificationSummary(refreshed, challenge.instructions);
    }

    if (isDevelopmentBypassVerification) {
      const now = this.now();
      const requestedUrl = this.resolveVerificationRequestedUrl(verification);
      const bypassDecision = this.verificationBypass.evaluate(
        requestedUrl,
        true
      );

      if (!bypassDecision.active) {
        const disabled = await this.verifications.updateStatus(verification.id, {
          status: "failed",
          lastCheckedAt: now.toISOString(),
          evidence: {
            ...verification.evidence,
            reason: "development_bypass_disabled"
          }
        });

        return this.toVerificationSummary(disabled, challenge.instructions);
      }

      const refreshed = await this.verifications.updateStatus(verification.id, {
        status: "verified",
        evidence: this.buildDevelopmentBypassEvidence(
          requestedUrl,
          bypassDecision
        ),
        lastCheckedAt: now.toISOString(),
        verifiedAt: verification.verifiedAt ?? now.toISOString(),
        expiresAt: this.addHours(now, 12).toISOString()
      });

      return this.toVerificationSummary(refreshed, challenge.instructions);
    }

    if (devModeBypass) {
      const requestedUrl = this.resolveVerificationRequestedUrl(verification);
      const bypassDecision = this.verificationBypass.evaluate(
        requestedUrl,
        true
      );

      if (bypassDecision.active) {
        const now = this.now();
        const bypassChallenge = this.buildDevelopmentBypassChallenge(
          requestedUrl,
          verification.method,
          verification.challengeToken,
          bypassDecision
        );
        const bypassVerification = await this.verifications.updateStatus(
          verification.id,
          {
            status: "verified",
            evidence: this.buildDevelopmentBypassEvidence(
              requestedUrl,
              bypassDecision
            ),
            challengeDetails: bypassChallenge.challengeDetails,
            lastCheckedAt: now.toISOString(),
            verifiedAt: now.toISOString(),
            expiresAt: this.addHours(now, 12).toISOString()
          }
        );

        return this.toVerificationSummary(
          bypassVerification,
          bypassChallenge.instructions
        );
      }
    }

    if (this.isExpired(verification.expiresAt) && verification.status !== "verified") {
      const expired = await this.verifications.updateStatus(verification.id, {
        status: "expired",
        lastCheckedAt: this.now().toISOString(),
        evidence: {
          reason: "verification_expired"
        }
      });

      return this.toVerificationSummary(expired, challenge.instructions);
    }

    const result = await this.performVerificationCheck(verification);
    const updated = await this.verifications.updateStatus(verification.id, {
      status: result.verified ? "verified" : this.isExpired(verification.expiresAt) ? "expired" : "failed",
      lastCheckedAt: this.now().toISOString(),
      verifiedAt: result.verified ? this.now().toISOString() : undefined,
      expiresAt: result.verified
        ? this.addDays(this.now(), 30).toISOString()
        : undefined,
      evidence: result.evidence
    });

    return this.toVerificationSummary(updated, challenge.instructions);
  }

  async listDomainVerifications(
    actor: AccessContext,
    limit = 25
  ): Promise<DomainOwnershipVerificationSummary[]> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.domain-verification",
      action: "list_domain_verifications",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const verifications = await this.verifications.listByWorkspace(
      actor.workspaceId,
      Math.max(1, Math.min(100, Math.trunc(limit)))
    );

    return verifications.map((verification) => {
      const instructions = this.buildChallenge(
        new URL(`https://${verification.hostname}/`),
        verification.method,
        verification.challengeToken,
        verification.challengeDetails
      ).instructions;
      return this.toVerificationSummary(verification, instructions);
    });
  }

  async getVerificationBypassStatus(
    actor: AccessContext
  ): Promise<AuthorizedTestingDevModeStatus> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.dev-mode",
      action: "get_authorized_testing_dev_mode_status",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    return this.verificationBypass.getStatus();
  }

  async runAuthorizedSecurityTest(
    actor: AccessContext,
    input: RunAuthorizedSecurityTestRequest
  ): Promise<AuthorizedSecurityTestReport> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.run",
      action: "run_authorized_security_test",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const { url: requestedUrl } = this.normalizeRequestedUrl(input.url);
    const requestedModules = this.normalizeModules(input.modules);
    const maxPages = this.normalizeMaxPages(input.maxPages);
    const maxRequests = this.normalizeMaxRequests(input.maxRequests);
    const authProfiles = this.normalizeAuthProfiles(input.authProfiles);
    const bypassDecision = this.verificationBypass.evaluate(
      requestedUrl,
      input.devModeBypass
    );
    let verification = input.verificationId
      ? await this.getWorkspaceVerification(actor, input.verificationId)
      : await this.createImplicitVerificationForDevelopmentRun(
          actor,
          requestedUrl,
          bypassDecision,
          input.devModeBypass
        );
    const isDevelopmentLocalVerification =
      this.isDevelopmentLocalVerification(verification);
    const isDevelopmentBypassVerification =
      this.isDevelopmentBypassVerification(verification);

    if (
      isDevelopmentLocalVerification &&
      !this.allowDevelopmentLocalTargets
    ) {
      throw new AppError(
        "Development local-target mode is disabled. Re-enable it in development or create a public hostname verification.",
        403,
        {
          verificationId: verification.id,
          hostname: verification.hostname
        }
      );
    }

    if (
      isDevelopmentBypassVerification &&
      !this.verificationBypass.getStatus().available
    ) {
      throw new AppError(
        "Development verification bypass is disabled. Re-enable it in development or complete normal domain ownership verification.",
        403,
        {
          verificationId: verification.id,
          hostname: verification.hostname
        }
      );
    }

    if (requestedUrl.hostname !== verification.hostname) {
      throw new AppError("Verified ownership only applies to the exact hostname that was challenged.", 400, {
        requestedHostname: requestedUrl.hostname,
        verifiedHostname: verification.hostname
      });
    }

    if (verification.status !== "verified" && bypassDecision.active) {
      const bypassChallenge = this.buildDevelopmentBypassChallenge(
        requestedUrl,
        verification.method,
        verification.challengeToken,
        bypassDecision
      );
      verification = await this.verifications.updateStatus(verification.id, {
        status: "verified",
        evidence: this.buildDevelopmentBypassEvidence(
          requestedUrl,
          bypassDecision
        ),
        challengeDetails: bypassChallenge.challengeDetails,
        lastCheckedAt: this.now().toISOString(),
        verifiedAt: this.now().toISOString(),
        expiresAt: this.addHours(this.now(), 12).toISOString()
      });
    }

    if (verification.status !== "verified") {
      throw new AppError("Domain ownership must be verified before active testing.", 400, {
        verificationId: verification.id,
        status: verification.status
      });
    }

    if (this.isExpired(verification.expiresAt)) {
      await this.verifications.updateStatus(verification.id, {
        status: "expired",
        lastCheckedAt: this.now().toISOString(),
        evidence: {
          reason: "verification_expired_before_run"
        }
      });

      throw new AppError("Domain ownership verification expired. Re-verify before testing.", 400, {
        verificationId: verification.id
      });
    }

    await this.policy.evaluatePolicy({
      actor,
      action: "admin.authorized_testing.execute",
      categories: ["security_research", "vulnerability_analysis", "external_url_access"],
      content:
        isDevelopmentLocalVerification || isDevelopmentBypassVerification || bypassDecision.active
          ? "Authorized active security testing against a development-approved application"
          : "Authorized active security testing against a verified public application",
      url: requestedUrl.toString(),
      metadata: {
        activeTesting: true,
        developmentLocalTarget: isDevelopmentLocalVerification,
        developmentVerificationBypass:
          isDevelopmentBypassVerification || bypassDecision.active,
        destructive: false,
        readOnlyMethods: ["GET", "HEAD", "OPTIONS"],
        modules: requestedModules,
        maxPages,
        maxRequests
      }
    });

    await this.assertSafePublicUrl(requestedUrl);

    const guardrails = this.buildGuardrails(
      maxRequests,
      isDevelopmentLocalVerification,
      isDevelopmentBypassVerification || bypassDecision.active
    );
    const run = await this.runs.create({
      workspaceId: actor.workspaceId,
      organizationId: actor.organizationId,
      verificationId: verification.id,
      requestedByUserId: actor.userId,
      targetUrl: requestedUrl.toString(),
      hostname: requestedUrl.hostname,
      status: "planned",
      requestedModules,
      guardrails,
      redactedAuthProfiles: authProfiles.map((profile) =>
        this.toRedactedAuthProfile(profile)
      )
    });

    const state: RunState = {
      runId: run.id,
      requestedUrl,
      maxRequests,
      requestsSent: 0,
      moduleWarnings: [],
      moduleConcurrency: 1,
      probeCacheHits: 0,
      probeCacheMisses: 0,
      adaptiveBackoffCount: 0,
      rateLimitedResponses: 0,
      networkRequestsSent: 0,
      probeCache: new Map(),
      pendingProbeCache: new Map(),
      requestReservationQueue: Promise.resolve(),
      nextAllowedProbeAt: 0
    };

    await this.logEvent(state.runId, {
      eventType: "status",
      severity: "info",
      message: "Authorized security test run created.",
      metadata: {
        targetUrl: requestedUrl.toString(),
        modules: requestedModules
      }
    });
    await this.logEvent(state.runId, {
      eventType: "ownership",
      severity: "info",
      message: isDevelopmentLocalVerification
        ? "Development local-target mode is active for the selected hostname."
        : isDevelopmentBypassVerification || bypassDecision.active
          ? "Development verification bypass is active for the selected hostname."
          : "Active testing confirmed a still-valid domain ownership verification.",
      metadata: {
        verificationId: verification.id,
        hostname: verification.hostname,
        method: verification.method,
        developmentLocalTarget: isDevelopmentLocalVerification,
        developmentVerificationBypass:
          isDevelopmentBypassVerification || bypassDecision.active,
        bypassMatchedDomain: bypassDecision.matchedDomain,
        verifiedAt: verification.verifiedAt,
        expiresAt: verification.expiresAt
      }
    });

    for (const guardrail of guardrails) {
      await this.logEvent(state.runId, {
        eventType: "guardrail",
        severity: "info",
        message: guardrail
      });
    }

    try {
      const scan = await this.websiteScanner.scanWebsite(actor, {
        url: requestedUrl.toString(),
        maxPages
      });

      const baseline = this.toBaseline(scan);
      const initialModulePriorities = this.buildModulePriorities(
        scan,
        requestedModules,
        authProfiles
      );
      const planning = await this.buildPlan(
        actor,
        baseline,
        initialModulePriorities.map((priority) => priority.module)
      );
      const initialPlannedSteps = this.prioritizePlanSteps(
        planning.steps,
        initialModulePriorities
      );
      state.moduleConcurrency = this.resolveModuleConcurrency(
        maxRequests,
        initialPlannedSteps.length
      );

      await this.runs.update(run.id, {
        status: "running",
        baseline,
        plan: initialPlannedSteps,
        startedAt: this.now().toISOString()
      });

      await this.logEvent(state.runId, {
        eventType: "plan",
        severity: "info",
        message: `Execution plan prepared from ${planning.source} planning.`,
        metadata: {
          planSource: planning.source,
          stepCount: initialPlannedSteps.length,
          moduleConcurrency: state.moduleConcurrency,
          prioritizedModules: initialModulePriorities.map((priority) => ({
            module: priority.module,
            score: priority.score,
            reasons: priority.reasons
          }))
        }
      });
      const initialExecution = await this.executePlannedModules(
        initialPlannedSteps,
        state,
        scan,
        authProfiles
      );
      state.moduleWarnings.push(...initialExecution.warnings);

      const adaptiveFollowUp = await this.buildAdaptiveFollowUp(
        actor,
        baseline,
        scan,
        initialPlannedSteps,
        initialExecution.findings,
        state,
        authProfiles
      );
      let plannedSteps = initialPlannedSteps;
      let executionFindings = [...initialExecution.findings];

      if (adaptiveFollowUp.steps.length > 0) {
        plannedSteps = [...initialPlannedSteps, ...adaptiveFollowUp.steps];
        state.moduleConcurrency = this.resolveModuleConcurrency(
          maxRequests,
          plannedSteps.length
        );

        await this.runs.update(run.id, {
          status: "running",
          plan: plannedSteps
        });

        await this.logEvent(state.runId, {
          eventType: "status",
          severity: "info",
          message: `Adaptive follow-up scheduled ${adaptiveFollowUp.steps.length} additional module${adaptiveFollowUp.steps.length === 1 ? "" : "s"}.`,
          metadata: {
            modules: adaptiveFollowUp.steps.map((step) => step.category),
            decisions: adaptiveFollowUp.decisions.map((decision) => ({
              module: decision.module,
              source: decision.source,
              urgency: decision.urgency
            }))
          }
        });

        const followUpExecution = await this.executePlannedModules(
          adaptiveFollowUp.steps,
          state,
          scan,
          authProfiles
        );
        state.moduleWarnings.push(...followUpExecution.warnings);
        executionFindings = [
          ...executionFindings,
          ...followUpExecution.findings
        ];
      }

      const modulePriorities = this.buildModulePriorities(
        scan,
        this.uniqueModules(plannedSteps.map((step) => step.category)),
        authProfiles
      );

      const findings = await this.validateFindings(
        actor,
        baseline,
        plannedSteps,
        executionFindings
      );

      const predictions = await this.buildPredictions(
        actor,
        scan,
        baseline,
        plannedSteps,
        findings
      );
      const attackPaths = await this.buildAttackPaths(
        actor,
        baseline,
        plannedSteps,
        findings,
        predictions
      );
      const summary = this.buildSummary(
        planning.source,
        plannedSteps.map((step) => step.category),
        modulePriorities,
        state,
        findings,
        adaptiveFollowUp
      );
      summary.campaignStory = this.buildCampaignStory(
        baseline,
        plannedSteps,
        findings,
        attackPaths,
        adaptiveFollowUp
      );
      const aiAnalysis = await this.buildAiAnalysis(
        actor,
        baseline,
        plannedSteps,
        findings,
        attackPaths,
        predictions,
        summary
      );
      const warnings = Array.from(
        new Set([...baseline.passiveWarnings, ...state.moduleWarnings])
      );

      const completed = await this.runs.update(run.id, {
        status: "completed",
        baseline,
        plan: plannedSteps,
        summary,
        findings,
        attackPaths,
        aiAnalysis,
        warnings,
        completedAt: this.now().toISOString()
      });

      await this.logEvent(state.runId, {
        eventType: "summary",
        severity: "info",
        message: summary.headline,
        metadata: {
          riskLevel: summary.riskLevel,
          requestsSent: summary.requestsSent
        }
      });

      const events = await this.events.listByRun(run.id);
      const refreshedVerification = await this.getWorkspaceVerification(
        actor,
        verification.id
      );
      return this.toReport(completed, refreshedVerification, events);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Authorized security test failed.";

      await this.runs.update(run.id, {
        status: "failed",
        warnings: Array.from(new Set([message, ...state.moduleWarnings])),
        completedAt: this.now().toISOString()
      });

      await this.logEvent(state.runId, {
        eventType: "warning",
        severity: "high",
        message: `Run failed: ${message}`
      });

      throw error;
    }
  }

  async getAuthorizedSecurityTestRun(
    actor: AccessContext,
    runId: string
  ): Promise<AuthorizedSecurityTestReport> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: `admin.authorized-testing.run.${runId}`,
      action: "get_authorized_security_test_run",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const run = await this.runs.findById(runId);
    if (!run || run.workspaceId !== actor.workspaceId) {
      throw new AppError("Authorized security test run not found", 404);
    }

    const verification = await this.getWorkspaceVerification(actor, run.verificationId);
    const events = await this.events.listByRun(run.id);
    return this.toReport(run, verification, events);
  }

  async listAuthorizedSecurityTestRuns(
    actor: AccessContext,
    limit = 20
  ): Promise<AuthorizedSecurityTestRunSummary[]> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.run",
      action: "list_authorized_security_test_runs",
      reason: "Authorized security testing requires 'admin_dashboard' permission"
    });

    const runs = await this.runs.listByWorkspace(
      actor.workspaceId,
      Math.max(1, Math.min(100, Math.trunc(limit)))
    );

    return runs.map((run) => ({
      runId: run.id,
      status: run.status,
      requestedUrl: run.targetUrl,
      hostname: run.hostname,
      executedAt: run.startedAt ?? run.createdAt,
      completedAt: run.completedAt,
      riskLevel: run.summary.riskLevel,
      findings: run.findings.length,
      highSeverityFindings: run.findings.filter(
        (finding) => finding.severity === "high"
      ).length
    }));
  }

  private async executeModule(
    module: AuthorizedSecurityTestModule,
    state: RunState,
    scan: WebsiteScanResult,
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): Promise<ModuleExecutionResult> {
    switch (module) {
      case "sql_injection":
        return this.executeSqlInjectionChecks(state, scan);
      case "xss":
        return this.executeXssChecks(state, scan);
      case "authentication":
        return this.executeAuthenticationChecks(state, scan);
      case "authorization":
        return this.executeAuthorizationChecks(state, scan, authProfiles);
      case "api_security":
        return this.executeApiSecurityChecks(state, scan, authProfiles);
      case "waf":
        return this.executeWafNormalizationChecks(state, scan);
      case "session_management":
        return this.executeSessionManagementChecks(state, scan);
      default:
        return {
          findings: [],
          warnings: [`Unsupported module '${module}'.`]
        };
    }
  }

  private async executePlannedModules(
    steps: AuthorizedSecurityPlanStep[],
    state: RunState,
    scan: WebsiteScanResult,
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): Promise<ModuleExecutionResult> {
    const results: ModuleExecutionResult[] = steps.map(() => ({
      findings: [],
      warnings: []
    }));
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= steps.length) {
          return;
        }

        const step = steps[currentIndex]!;
        await this.logEvent(state.runId, {
          eventType: "status",
          severity: "info",
          category: step.category,
          message: `Executing ${step.category} checks.`,
          metadata: {
            objective: step.objective,
            stepId: step.id
          }
        });

        try {
          results[currentIndex] = await this.executeModule(
            step.category,
            state,
            scan,
            authProfiles
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Module execution failed for an unknown reason.";
          results[currentIndex] = {
            findings: [],
            warnings: [`${step.category}: ${message}`]
          };
          await this.logEvent(state.runId, {
            eventType: "warning",
            severity: "medium",
            category: step.category,
            message: `Module execution degraded: ${message}`
          });
        }
      }
    };

    await Promise.all(
      Array.from(
        {
          length: Math.max(1, Math.min(state.moduleConcurrency, steps.length))
        },
        () => worker()
      )
    );

    return {
      findings: results.flatMap((result) => result.findings),
      warnings: results.flatMap((result) => result.warnings)
    };
  }

  private async executeSqlInjectionChecks(
    state: RunState,
    scan: WebsiteScanResult
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const candidates = this.buildParameterizedCandidates(
      this.collectPageUrls(scan),
      ["search", "filter", "query", "item", "user", "order", "product", "details"]
    );

    if (candidates.length === 0) {
      warnings.push("No query-driven endpoints were discovered for SQL injection probing.");
      return { findings, warnings };
    }

    const errorPattern =
      /(sql syntax|syntax error|unterminated quoted string|sqlite|postgresql|sqlstate|mysql|ora-\d{5}|odbc|database error)/i;

    for (const candidate of candidates.slice(0, 3)) {
      const baseline = await this.performProbe(state, candidate.url, {
        category: "sql_injection",
        label: "baseline-sql"
      });
      if (!baseline) {
        warnings.push("SQL injection probes stopped after reaching the request budget.");
        break;
      }

      const probeUrl = new URL(candidate.url);
      probeUrl.searchParams.set(candidate.paramName, `${candidate.value}'`);
      const probe = await this.performProbe(state, probeUrl, {
        category: "sql_injection",
        label: "sql-probe"
      });
      if (!probe) {
        warnings.push("SQL injection probes stopped after reaching the request budget.");
        break;
      }

      const baselineMatched = errorPattern.test(baseline.body);
      const probeMatched = errorPattern.test(probe.body);
      const suspicious =
        (!baselineMatched && probeMatched) ||
        (baseline.status < 500 && probe.status >= 500);

      if (!suspicious) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "sql_injection",
        severity: "high",
        title: "Read-only SQL injection probe triggered database error behavior",
        summary:
          "A benign quote-based input mutation changed the response in a way that resembles unsafe backend query handling.",
        evidence: [
          `endpoint=${probe.finalUrl}`,
          `parameter=${candidate.paramName}`,
          `baselineStatus=${baseline.status}`,
          `probeStatus=${probe.status}`
        ],
        remediation:
          "Parameterize database access, reject raw string concatenation in query builders, and add regression tests around the affected endpoint.",
        safeRetest:
          "Repeat the exact read-only quote probe after the fix and confirm the response no longer leaks database errors or flips into a 5xx.",
        supportingEventIds: [baseline.eventId, probe.eventId]
      });

      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "high",
        category: "sql_injection",
        message: "Potential SQL injection signal confirmed from a read-only probe.",
        metadata: {
          endpoint: probe.finalUrl,
          parameter: candidate.paramName
        }
      });
    }

    return { findings, warnings };
  }

  private async executeXssChecks(
    state: RunState,
    scan: WebsiteScanResult
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const candidates = this.buildParameterizedCandidates(
      this.collectPageUrls(scan),
      ["search", "query", "q", "return", "next", "redirect"]
    );

    if (candidates.length === 0) {
      warnings.push("No reflection candidates were discovered for inert XSS probing.");
      return { findings, warnings };
    }

    for (const candidate of candidates.slice(0, 3)) {
      const probeToken = `cognexa-xss-${randomUUID().slice(0, 8)}`;
      const payload = `${probeToken}"'><cognexa-probe-${probeToken}>`;
      const probeUrl = new URL(candidate.url);
      probeUrl.searchParams.set(candidate.paramName, payload);
      const probe = await this.performProbe(state, probeUrl, {
        category: "xss",
        label: "xss-probe"
      });

      if (!probe) {
        warnings.push("XSS probes stopped after reaching the request budget.");
        break;
      }

      const reflectedRaw = probe.body.includes(payload) || probe.body.includes(
        `<cognexa-probe-${probeToken}>`
      );
      const reflectedEncoded =
        probe.body.includes(`&lt;cognexa-probe-${probeToken}&gt;`) ||
        probe.body.includes("&quot;");

      if (!reflectedRaw || reflectedEncoded) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "xss",
        severity: "medium",
        title: "Inert reflection probe appears to be returned without output encoding",
        summary:
          "A non-executable HTML marker was reflected back in the response without clear output encoding, which may indicate an XSS sink.",
        evidence: [
          `endpoint=${probe.finalUrl}`,
          `parameter=${candidate.paramName}`,
          `marker=cognexa-probe-${probeToken}`
        ],
        remediation:
          "Apply context-aware output encoding, validate untrusted input before rendering, and pair the fix with CSP and template regression tests.",
        safeRetest:
          "Re-send the same inert marker and confirm the HTML characters are encoded instead of being reflected verbatim.",
        supportingEventIds: [probe.eventId]
      });

      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "medium",
        category: "xss",
        message: "Potential reflective XSS sink identified from an inert marker.",
        metadata: {
          endpoint: probe.finalUrl,
          parameter: candidate.paramName
        }
      });
    }

    return { findings, warnings };
  }

  private async executeAuthenticationChecks(
    state: RunState,
    scan: WebsiteScanResult
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const candidates = this.buildProtectedRouteCandidates(scan);

    for (const candidate of candidates.slice(0, 6)) {
      const probe = await this.performProbe(state, candidate, {
        category: "authentication",
        label: "auth-check"
      });

      if (!probe) {
        warnings.push("Authentication probes stopped after reaching the request budget.");
        break;
      }

      if (!this.looksLikeProtectedContent(candidate, probe)) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "authentication",
        severity: "high",
        title: "A protected-looking route appears reachable without authentication",
        summary:
          "A route that looks administrative or account-scoped returned content directly instead of a login challenge, redirect, or 401/403 response.",
        evidence: [
          `endpoint=${probe.finalUrl}`,
          `status=${probe.status}`,
          `path=${candidate.pathname}`
        ],
        remediation:
          "Enforce authentication at the route or gateway layer, validate session state before rendering privileged views, and add negative access tests for anonymous users.",
        safeRetest:
          "Repeat the same GET request anonymously and confirm the application now returns a redirect to sign-in or a 401/403 response.",
        supportingEventIds: [probe.eventId]
      });

      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "high",
        category: "authentication",
        message: "Potential unauthenticated access to a protected route detected.",
        metadata: {
          endpoint: probe.finalUrl
        }
      });
    }

    return { findings, warnings };
  }

  private async executeAuthorizationChecks(
    state: RunState,
    scan: WebsiteScanResult,
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const privilegedProfile = authProfiles.find(
      (profile) => profile.role === "high_privilege"
    );
    const comparisonProfiles = authProfiles.filter(
      (profile) => profile.role !== "high_privilege"
    );

    if (!privilegedProfile || comparisonProfiles.length === 0) {
      warnings.push(
        "Authorization differential checks were skipped because both high-privilege and comparison profiles were not provided."
      );
      return { findings, warnings };
    }

    const candidates = this.buildProtectedRouteCandidates(scan).filter((candidate) =>
      /(admin|users|roles|permissions|settings|manage|api\/admin|api\/users)/i.test(
        candidate.pathname
      )
    );

    for (const candidate of candidates.slice(0, 4)) {
      const highProbe = await this.performProbe(state, candidate, {
        category: "authorization",
        label: "authz-high",
        authProfile: privilegedProfile
      });

      if (!highProbe) {
        warnings.push("Authorization probes stopped after reaching the request budget.");
        break;
      }

      for (const profile of comparisonProfiles.slice(0, 2)) {
        const probe = await this.performProbe(state, candidate, {
          category: "authorization",
          label: `authz-${profile.role}`,
          authProfile: profile
        });

        if (!probe) {
          warnings.push("Authorization probes stopped after reaching the request budget.");
          break;
        }

        const sameStatus = probe.status === highProbe.status;
        const sameBody = probe.bodyHash === highProbe.bodyHash;
        if (
          highProbe.status === 200 &&
          probe.status === 200 &&
          sameStatus &&
          sameBody
        ) {
          findings.push({
            id: randomUUID(),
            category: "authorization",
            severity: "high",
            title: "Privilege-differential probe did not change access to an admin-like route",
            summary:
              "A lower-trust profile received the same successful response as the privileged profile for an endpoint that appears to require stronger authorization.",
            evidence: [
              `endpoint=${probe.finalUrl}`,
              `comparisonRole=${profile.role}`,
              `highStatus=${highProbe.status}`,
              `comparisonStatus=${probe.status}`
            ],
            remediation:
              "Bind access checks to the authenticated principal on the server, verify role and tenant scope for each privileged route, and add negative authorization tests per role.",
            safeRetest:
              "Repeat the same GET request with the lower-trust profile and confirm it now receives a 401/403 or a clearly reduced response.",
            supportingEventIds: [highProbe.eventId, probe.eventId]
          });

          await this.logEvent(state.runId, {
            eventType: "finding",
            severity: "high",
            category: "authorization",
            message: "Potential authorization gap detected from a role-differential probe.",
            metadata: {
              endpoint: probe.finalUrl,
              comparisonRole: profile.role
            }
          });
        }
      }
    }

    return { findings, warnings };
  }

  private async executeApiSecurityChecks(
    state: RunState,
    scan: WebsiteScanResult,
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const seenAdvancedFindings = new Set<string>();
    const documentationCandidates = this.buildApiDocumentationCandidates(scan);
    const apiCandidates = this.buildSensitiveApiRouteCandidates(scan);
    const objectCandidates = this.buildApiObjectCandidates(scan);
    const parameterizedCandidates = this.buildParameterizedCandidates(
      this.collectApiUrls(scan),
      [
        "search",
        "query",
        "filter",
        "item",
        "user",
        "users",
        "account",
        "profile",
        "order",
        "orders",
        "project",
        "projects",
        "return",
        "next",
        "redirect"
      ]
    ).filter((candidate) => this.isApiLikePath(candidate.url));
    const privilegedProfile = authProfiles.find(
      (profile) => profile.role === "high_privilege"
    );
    const comparisonProfiles = authProfiles.filter(
      (profile) => profile.role !== "high_privilege"
    );
    const documentationSignals: ProbeResponseSummary[] = [];
    const writableSchemaFields = new Set<string>();
    let sawStateChangingSchema = false;
    let sawCookieAuthHints = false;

    const pushAdvancedFinding = async (input: {
      severity: AuthorizedSecurityFindingSeverity;
      title: string;
      summary: string;
      evidence: string[];
      remediation: string;
      safeRetest: string;
      supportingEventIds: string[];
      apiDetails: AuthorizedApiFindingDetails;
      logMessage: string;
      logMetadata?: Record<string, unknown>;
    }) => {
      const key = [
        input.apiDetails.vulnerabilityType,
        input.apiDetails.method,
        input.apiDetails.endpoint
      ].join("::");
      if (seenAdvancedFindings.has(key)) {
        return;
      }

      seenAdvancedFindings.add(key);
      findings.push({
        id: randomUUID(),
        category: "api_security",
        severity: input.severity,
        title: input.title,
        summary: input.summary,
        evidence: input.evidence,
        remediation: input.remediation,
        safeRetest: input.safeRetest,
        supportingEventIds: input.supportingEventIds,
        apiDetails: input.apiDetails
      });

      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: input.severity,
        category: "api_security",
        message: input.logMessage,
        metadata: {
          endpoint: input.apiDetails.endpoint,
          method: input.apiDetails.method,
          vulnerabilityType: input.apiDetails.vulnerabilityType,
          ...input.logMetadata
        }
      });
    };
    const resolveProbeUrl = (probe: ProbeResponseSummary) =>
      probe.finalUrl || probe.requestedUrl;
    const scoreSqlCandidate = (candidate: {
      url: URL;
      paramName: string;
    }) => {
      let score = [...candidate.url.searchParams.keys()].length > 0 ? 3 : 0;
      if (/(search|query|filter)/i.test(candidate.url.pathname)) {
        score += 2;
      }
      if (/^(q|query|filter)$/i.test(candidate.paramName)) {
        score += 1;
      }

      return score;
    };
    const scoreXssCandidate = (candidate: {
      url: URL;
      paramName: string;
    }) => {
      let score = [...candidate.url.searchParams.keys()].length > 0 ? 3 : 0;
      if (/(redirect|return|next)/i.test(candidate.url.pathname)) {
        score += 3;
      } else if (/(search|query)/i.test(candidate.url.pathname)) {
        score += 2;
      }
      if (/^(next|return|redirect)$/i.test(candidate.paramName)) {
        score += 2;
      }

      return score;
    };

    for (const candidate of documentationCandidates.slice(0, 2)) {
      const docsProbe = await this.performProbe(state, candidate, {
        category: "api_security",
        label: "api-docs"
      });

      if (!docsProbe) {
        warnings.push("API probes stopped after reaching the request budget.");
        break;
      }

      if (
        docsProbe.status === 200 &&
        this.isApiDocumentationResponse(docsProbe)
      ) {
        documentationSignals.push(docsProbe);
        sawStateChangingSchema ||= this.hasStateChangingApiSurface(docsProbe.body);
        sawCookieAuthHints ||= this.hasCookieAuthHints(docsProbe.body);
        for (const field of this.extractWritableApiSchemaFields(docsProbe.body)) {
          writableSchemaFields.add(field);
        }

        findings.push({
          id: randomUUID(),
          category: "api_security",
          severity: "low",
          title: "Public API surface description was reachable without authentication",
          summary:
            "A machine-readable API description or developer endpoint was directly accessible from the public edge.",
          evidence: [
            `endpoint=${resolveProbeUrl(docsProbe)}`,
            `status=${docsProbe.status}`
          ],
          remediation:
            "Limit sensitive API discovery endpoints to authenticated administrators or serve a sanitized public variant without internal routes.",
          safeRetest:
            "Re-fetch the same path anonymously and confirm the description is removed or access-controlled.",
          supportingEventIds: [docsProbe.eventId]
        });
        await this.logEvent(state.runId, {
          eventType: "finding",
          severity: "low",
          category: "api_security",
          message: "Public API description or developer endpoint was reachable anonymously.",
          metadata: {
            endpoint: resolveProbeUrl(docsProbe)
          }
        });
      }
    }

    if (documentationSignals.length > 0) {
      const sampleSchemaProbe = documentationSignals[0]!;
      const schemaFields = [...writableSchemaFields].slice(0, 4);

      if (sawStateChangingSchema && schemaFields.length > 0) {
        await pushAdvancedFinding({
          severity: "medium",
          title: "Public API schema advertises writable sensitive fields",
          summary:
          "A publicly reachable API description included state-changing operations and sensitive assignment-like fields, which can enable mass-assignment abuse if server-side allowlists are weak.",
          evidence: [
            `endpoint=${resolveProbeUrl(sampleSchemaProbe)}`,
            `writableFields=${schemaFields.join(",")}`,
            "stateChangingOperations=true"
          ],
          remediation:
            "Restrict public schema exposure, split read and write DTOs, and enforce explicit server-side allowlists for privileged fields such as roles and permissions.",
          safeRetest:
            "Re-fetch the same schema and confirm sensitive write fields are removed from public contracts or blocked behind authenticated administrative access.",
          supportingEventIds: documentationSignals.map((probe) => probe.eventId),
          apiDetails: {
            endpoint: resolveProbeUrl(sampleSchemaProbe),
            method: "GET",
            vulnerabilityType: "mass_assignment",
            confidence: 63,
            poc: `GET ${resolveProbeUrl(sampleSchemaProbe)}`
          },
          logMessage:
            "Public API schema exposed state-changing operations with sensitive writable fields.",
          logMetadata: {
            writableFields: schemaFields
          }
        });
      }

      if (
        sawStateChangingSchema &&
        scan.cookies.missingSameSite > 0 &&
        (sawCookieAuthHints || scan.cookies.total > 0)
      ) {
        await pushAdvancedFinding({
          severity: "medium",
          title: "Cookie-backed API surface may be missing strong CSRF boundaries",
          summary:
            "The passive baseline observed session cookies without SameSite protection, while the reachable API surface advertises state-changing operations that may rely on cookie authentication.",
          evidence: [
            `missingSameSite=${scan.cookies.missingSameSite}`,
            `endpoint=${resolveProbeUrl(sampleSchemaProbe)}`,
            "stateChangingOperations=true"
          ],
          remediation:
            "Require SameSite protection for session cookies, add explicit anti-CSRF tokens or origin validation on state-changing endpoints, and avoid cookie-only API auth where it is unnecessary.",
          safeRetest:
            "Repeat the same documentation review and confirm state-changing API flows now require SameSite-protected cookies and anti-CSRF validation.",
          supportingEventIds: documentationSignals.map((probe) => probe.eventId),
          apiDetails: {
            endpoint: resolveProbeUrl(sampleSchemaProbe),
            method: "GET",
            vulnerabilityType: "csrf",
            confidence: 58,
            poc: `GET ${resolveProbeUrl(sampleSchemaProbe)}`
          },
          logMessage:
            "API schema and cookie posture suggest a CSRF review is needed for state-changing operations.",
          logMetadata: {
            missingSameSite: scan.cookies.missingSameSite
          }
        });
      }
    }

    for (const candidate of apiCandidates.slice(0, 3)) {
      const probe = await this.performProbe(state, candidate, {
        category: "api_security",
        label: "api-data-check"
      });

      if (!probe) {
        warnings.push("Deep API probes stopped after reaching the request budget.");
        break;
      }

      if (
        probe.status !== 200 ||
        !this.isReadableApiResponse(probe) ||
        this.isApiDocumentationResponse(probe)
      ) {
        continue;
      }

      const sensitiveFields = this.detectSensitiveApiFields(probe.body);
      if (sensitiveFields.length === 0) {
        continue;
      }

      const severity = sensitiveFields.some((field) =>
        /(token|secret|api[_-]?key|password|refresh[_-]?token)/i.test(field)
      )
        ? "high"
        : "medium";

      await pushAdvancedFinding({
        severity,
        title: "API route returned sensitive application data without an access challenge",
        summary:
          "A read-only API request returned data fields that appear account-scoped or secret-bearing instead of enforcing a clear authorization boundary.",
        evidence: [
          `endpoint=${resolveProbeUrl(probe)}`,
          `status=${probe.status}`,
          `fields=${sensitiveFields.slice(0, 4).join(",")}`
        ],
        remediation:
          "Require authentication and authorization before returning sensitive API fields, minimize default response bodies, and add negative tests for anonymous access to account and configuration routes.",
        safeRetest:
          "Repeat the same GET request anonymously and confirm the endpoint now returns a 401/403 or a reduced non-sensitive payload.",
        supportingEventIds: [probe.eventId],
        apiDetails: {
          endpoint: resolveProbeUrl(probe),
          method: "GET",
          vulnerabilityType: "data_leakage",
          confidence: severity === "high" ? 88 : 78,
          poc: `GET ${resolveProbeUrl(probe)}`
        },
        logMessage: "Sensitive API data was returned without an access challenge.",
        logMetadata: {
          fields: sensitiveFields.slice(0, 4)
        }
      });
    }

    if (!privilegedProfile || comparisonProfiles.length === 0) {
      warnings.push(
        "API differential authorization checks were skipped because both high-privilege and comparison auth profiles were not provided."
      );
    } else {
      const authBypassCandidates = apiCandidates.filter(
        (candidate) =>
          !this.isObjectReferenceCandidate(candidate) &&
          /(admin|internal|config|settings|roles|permissions|users|profile|account|session|token|graphql)/i.test(
            candidate.pathname
          )
      );

      for (const candidate of authBypassCandidates.slice(0, 2)) {
        const highProbe = await this.performProbe(state, candidate, {
          category: "api_security",
          label: "api-authz-high",
          authProfile: privilegedProfile
        });

        if (!highProbe) {
          warnings.push("Deep API probes stopped after reaching the request budget.");
          break;
        }

        if (highProbe.status !== 200) {
          continue;
        }

        for (const profile of comparisonProfiles.slice(0, 2)) {
          const probe = await this.performProbe(state, candidate, {
            category: "api_security",
            label: `api-authz-${profile.role}`,
            authProfile: profile
          });

          if (!probe) {
            warnings.push("Deep API probes stopped after reaching the request budget.");
            break;
          }

          if (probe.status === 200 && probe.bodyHash === highProbe.bodyHash) {
            await pushAdvancedFinding({
              severity: "high",
              title:
                "Lower-trust API profile received the same privileged response",
              summary:
                "A lower-trust request context received the same successful API response as the privileged profile for a route that appears administrative or internally scoped.",
              evidence: [
                `endpoint=${resolveProbeUrl(probe)}`,
                `comparisonRole=${profile.role}`,
                `highStatus=${highProbe.status}`,
                `comparisonStatus=${probe.status}`
              ],
              remediation:
                "Bind authorization to the authenticated principal on every API route, enforce tenant and role checks server-side, and add role-differential API tests for privileged endpoints.",
              safeRetest:
                "Repeat the same GET request with the lower-trust profile and confirm it now receives a 401/403 or a clearly reduced response body.",
              supportingEventIds: [highProbe.eventId, probe.eventId],
              apiDetails: {
                endpoint: resolveProbeUrl(probe),
                method: "GET",
                vulnerabilityType: "auth_bypass",
                confidence: 86,
                poc: `GET ${resolveProbeUrl(probe)}`
              },
              logMessage:
                "Role-differential API probing showed a lower-trust profile receiving the same privileged response.",
              logMetadata: {
                comparisonRole: profile.role
              }
            });
          }
        }
      }

      for (const candidate of objectCandidates.slice(0, 1)) {
        const highProbe = await this.performProbe(state, candidate, {
          category: "api_security",
          label: "api-object-high",
          authProfile: privilegedProfile
        });

        if (!highProbe) {
          warnings.push("Deep API probes stopped after reaching the request budget.");
          break;
        }

        if (highProbe.status !== 200) {
          continue;
        }

        for (const profile of comparisonProfiles.slice(0, 2)) {
          const probe = await this.performProbe(state, candidate, {
            category: "api_security",
            label: `api-object-${profile.role}`,
            authProfile: profile
          });

          if (!probe) {
            warnings.push("Deep API probes stopped after reaching the request budget.");
            break;
          }

          if (probe.status === 200 && probe.bodyHash === highProbe.bodyHash) {
            await pushAdvancedFinding({
              severity: "high",
              title:
                "Object-style API resource did not vary between privileged and lower-trust profiles",
              summary:
                "A lower-trust profile retrieved the same object-scoped API response as the privileged profile, which can indicate an insecure direct object reference condition.",
              evidence: [
                `endpoint=${resolveProbeUrl(probe)}`,
                `comparisonRole=${profile.role}`,
                `highStatus=${highProbe.status}`,
                `comparisonStatus=${probe.status}`
              ],
              remediation:
                "Authorize object access on the server for every requested identifier, scope records to the caller's tenant or ownership boundary, and add negative tests for direct object fetches.",
              safeRetest:
                "Repeat the same GET request for the object path with the lower-trust profile and confirm the server now returns a denial or a scoped object.",
              supportingEventIds: [highProbe.eventId, probe.eventId],
              apiDetails: {
                endpoint: resolveProbeUrl(probe),
                method: "GET",
                vulnerabilityType: "idor",
                confidence: 84,
                poc: `GET ${resolveProbeUrl(probe)}`
              },
              logMessage:
                "Object-scoped API probing showed no access difference between privileged and lower-trust profiles.",
              logMetadata: {
                comparisonRole: profile.role
              }
            });
          }
        }
      }
    }

    for (const candidate of [...parameterizedCandidates]
      .filter(
        (candidate) =>
          /(search|query|filter|item|user|users|account|profile|order|orders|project|projects)/i.test(
            candidate.url.pathname
          ) || /^(id|q|query|filter|user|account)$/i.test(candidate.paramName)
      )
      .sort((left, right) => scoreSqlCandidate(right) - scoreSqlCandidate(left))
      .slice(0, 1)) {
      const baseline = await this.performProbe(state, candidate.url, {
        category: "api_security",
        label: "api-sql-baseline"
      });

      if (!baseline) {
        warnings.push("Deep API probes stopped after reaching the request budget.");
        break;
      }

      const probeUrl = new URL(candidate.url);
      probeUrl.searchParams.set(candidate.paramName, `${candidate.value}'`);
      const probe = await this.performProbe(state, probeUrl, {
        category: "api_security",
        label: "api-sql-probe"
      });

      if (!probe) {
        warnings.push("Deep API probes stopped after reaching the request budget.");
        break;
      }

      const errorPattern =
        /(sql syntax|syntax error|unterminated quoted string|sqlite|postgresql|sqlstate|mysql|ora-\d{5}|odbc|database error)/i;
      const suspicious =
        (!errorPattern.test(baseline.body) && errorPattern.test(probe.body)) ||
        (baseline.status < 500 && probe.status >= 500);

      if (!suspicious) {
        continue;
      }

      await pushAdvancedFinding({
        severity: "high",
        title: "Read-only API parameter mutation triggered database error behavior",
        summary:
          "A benign quote-based API parameter mutation changed the response in a way that resembles unsafe backend query construction.",
        evidence: [
          `endpoint=${resolveProbeUrl(probe)}`,
          `parameter=${candidate.paramName}`,
          `baselineStatus=${baseline.status}`,
          `probeStatus=${probe.status}`
        ],
        remediation:
          "Parameterize backend queries, reject unsafe dynamic query fragments, and add regression coverage for the affected API parameter handling.",
        safeRetest:
          "Repeat the same read-only quote probe after the fix and confirm the API no longer leaks database errors or flips into a 5xx.",
        supportingEventIds: [baseline.eventId, probe.eventId],
        apiDetails: {
          endpoint: resolveProbeUrl(probe),
          method: "GET",
          vulnerabilityType: "sql_injection",
          confidence: 89,
          poc: `GET ${resolveProbeUrl(probe)}`
        },
        logMessage:
          "A read-only API parameter probe triggered database error behavior.",
        logMetadata: {
          parameter: candidate.paramName
        }
      });
    }

    for (const candidate of [...parameterizedCandidates]
      .filter(
        (candidate) =>
          /(search|query|return|next|redirect)/i.test(candidate.url.pathname) ||
          /^(q|query|return|next|redirect)$/i.test(candidate.paramName)
      )
      .sort((left, right) => scoreXssCandidate(right) - scoreXssCandidate(left))
      .slice(0, 1)) {
      const probeToken = `cognexa-api-xss-${randomUUID().slice(0, 8)}`;
      const payload = `${probeToken}"'><cognexa-api-probe-${probeToken}>`;
      const probeUrl = new URL(candidate.url);
      probeUrl.searchParams.set(candidate.paramName, payload);
      const probe = await this.performProbe(state, probeUrl, {
        category: "api_security",
        label: "api-xss-probe"
      });

      if (!probe) {
        warnings.push("Deep API probes stopped after reaching the request budget.");
        break;
      }

      const reflectedRaw =
        probe.body.includes(payload) ||
        probe.body.includes(`<cognexa-api-probe-${probeToken}>`);
      const reflectedEncoded =
        probe.body.includes(`&lt;cognexa-api-probe-${probeToken}&gt;`) ||
        probe.body.includes("&quot;");

      if (!reflectedRaw || reflectedEncoded) {
        continue;
      }

      await pushAdvancedFinding({
        severity: "medium",
        title: "API response reflected an inert marker without clear output encoding",
        summary:
          "A non-executable reflection marker was returned by the API response without clear output encoding, which can indicate an XSS-adjacent sink in downstream rendering paths.",
        evidence: [
          `endpoint=${resolveProbeUrl(probe)}`,
          `parameter=${candidate.paramName}`,
          `marker=cognexa-api-probe-${probeToken}`
        ],
        remediation:
          "Apply context-aware output encoding in API-driven rendering paths, validate untrusted input, and add regression tests around reflected API parameters.",
        safeRetest:
          "Repeat the same inert marker request and confirm the API response encodes the HTML marker instead of reflecting it verbatim.",
        supportingEventIds: [probe.eventId],
        apiDetails: {
          endpoint: resolveProbeUrl(probe),
          method: "GET",
          vulnerabilityType: "xss",
          confidence: 72,
          poc: `GET ${resolveProbeUrl(probe)}`
        },
        logMessage:
          "An inert marker was reflected by an API response without clear output encoding.",
        logMetadata: {
          parameter: candidate.paramName
        }
      });
    }

    const corsCandidates = this.buildCorsCandidates(scan);
    for (const candidate of corsCandidates.slice(0, 2)) {
      const corsProbe = await this.performProbe(state, candidate, {
        category: "api_security",
        label: "cors-check",
        method: "OPTIONS",
        headers: {
          Origin: "https://cognexa-probe.invalid",
          "Access-Control-Request-Method": "GET"
        }
      });

      if (!corsProbe) {
        warnings.push("CORS probes stopped after reaching the request budget.");
        break;
      }

      const allowOrigin = corsProbe.headers.get("access-control-allow-origin");
      const allowCredentials = corsProbe.headers.get(
        "access-control-allow-credentials"
      );
      if (
        allowOrigin &&
        (allowOrigin === "*" || allowOrigin === "https://cognexa-probe.invalid") &&
        allowCredentials?.toLowerCase() === "true"
      ) {
        findings.push({
          id: randomUUID(),
          category: "api_security",
          severity: "high",
          title: "CORS policy appears overly permissive for credentialed requests",
          summary:
            "The preflight response allowed a broad origin while also advertising credential support, which can weaken browser-side API isolation.",
          evidence: [
            `endpoint=${resolveProbeUrl(corsProbe)}`,
            `allowOrigin=${allowOrigin}`,
            `allowCredentials=${allowCredentials}`
          ],
          remediation:
            "Restrict Access-Control-Allow-Origin to explicitly trusted origins, disable credentialed CORS where it is unnecessary, and add automated preflight regression tests.",
          safeRetest:
            "Repeat the same OPTIONS request and confirm the origin is no longer broadly allowed alongside credentials.",
          supportingEventIds: [corsProbe.eventId]
        });
        await this.logEvent(state.runId, {
          eventType: "finding",
          severity: "high",
          category: "api_security",
          message: "Credentialed CORS policy appears overly permissive.",
          metadata: {
            endpoint: resolveProbeUrl(corsProbe),
            allowOrigin,
            allowCredentials
          }
        });
      }
    }

    const rateLimitCandidate = apiCandidates.find((candidate) =>
      /(admin|users|profile|account|search|query|graphql|reports|settings)/i.test(
        candidate.pathname
      )
    );
    if (rateLimitCandidate) {
      const responses: ProbeResponseSummary[] = [];

      for (let index = 0; index < 3; index += 1) {
        const probe = await this.performProbe(state, rateLimitCandidate, {
          category: "api_security",
          label: "api-rate-limit",
          headers: {
            "X-Cognexa-Burst": String(index + 1)
          }
        });

        if (!probe) {
          warnings.push("Deep API probes stopped after reaching the request budget.");
          break;
        }

        responses.push(probe);
      }

      if (responses.length === 3) {
        const sawThrottling = responses.some((response) =>
          [429, 503].includes(response.status)
        );
        const surfacedRateLimits = responses.some((response) =>
          this.hasRateLimitHeaders(response.headers)
        );

        if (
          !sawThrottling &&
          !surfacedRateLimits &&
          responses.every((response) => response.status < 400)
        ) {
          await pushAdvancedFinding({
            severity: "low",
            title:
              "Sensitive-looking API route did not show observable throttling under a tiny safe burst",
            summary:
              "Three small read-only requests completed without a visible throttle response or quota headers, so the endpoint may rely on weak or absent rate limiting.",
            evidence: [
              `endpoint=${rateLimitCandidate.toString()}`,
              `statuses=${responses.map((response) => response.status).join(",")}`,
              "rateLimitHeaders=absent"
            ],
            remediation:
              "Add or tighten per-user and per-IP throttling for sensitive API routes, surface consistent quota headers where appropriate, and alert on bursty access patterns.",
            safeRetest:
              "Repeat the same tiny burst after the change and confirm the route now exposes quota headers or visibly throttles repeated requests.",
            supportingEventIds: responses.map((response) => response.eventId),
            apiDetails: {
              endpoint: rateLimitCandidate.toString(),
              method: "GET",
              vulnerabilityType: "rate_limiting",
              confidence: 49,
              poc: `GET ${rateLimitCandidate.toString()}`
            },
            logMessage:
              "A tiny burst of read-only API requests completed without observable throttling or quota headers."
          });
        }
      }
    }

    return { findings, warnings };
  }

  private async executeWafNormalizationChecks(
    state: RunState,
    scan: WebsiteScanResult
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];
    const candidate = this.collectPageUrls(scan)[0];

    if (!candidate) {
      warnings.push("No target URL was available for WAF normalization checks.");
      return { findings, warnings };
    }

    const variants: [URL, URL, URL] = [
      new URL(candidate),
      new URL(candidate),
      new URL(candidate)
    ];
    variants[0].searchParams.set("cognexa_probe", "alpha-beta");
    variants[1].searchParams.set("cognexa_probe", "alpha%2Dbeta");
    variants[2].search = "cognexa_probe=alpha-beta&cognexa_probe=alpha-beta";

    const responses: ProbeResponseSummary[] = [];
    for (const variant of variants) {
      const probe = await this.performProbe(state, variant, {
        category: "waf",
        label: "waf-normalization"
      });

      if (!probe) {
        warnings.push("WAF normalization probes stopped after reaching the request budget.");
        break;
      }

      responses.push(probe);
    }

    if (responses.length >= 2) {
      const distinctStatuses = new Set(responses.map((response) => response.status));
      if (distinctStatuses.size > 1) {
        findings.push({
          id: randomUUID(),
          category: "waf",
          severity: "medium",
          title: "Edge filtering responded inconsistently to semantically similar benign requests",
          summary:
            "Normalized request variants with safe sentinel data received materially different edge responses, which can indicate inconsistent inspection or routing behavior.",
          evidence: responses.map(
            (response) => `${response.finalUrl} -> ${response.status}`
          ),
          remediation:
            "Review canonicalization and normalization rules at the edge, ensure equivalent requests are evaluated consistently, and align WAF inspection with the application router.",
          safeRetest:
            "Repeat the same benign normalization variants and confirm the edge produces consistent status codes and handling for each form.",
          supportingEventIds: responses.map((response) => response.eventId)
        });
        await this.logEvent(state.runId, {
          eventType: "finding",
          severity: "medium",
          category: "waf",
          message: "Edge normalization behavior differed across equivalent benign requests.",
          metadata: {
            statuses: responses.map((response) => ({
              url: response.finalUrl,
              status: response.status
            }))
          }
        });
      }
    }

    return { findings, warnings };
  }

  private async executeSessionManagementChecks(
    state: RunState,
    scan: WebsiteScanResult
  ): Promise<ModuleExecutionResult> {
    const findings: AuthorizedSecurityFinding[] = [];
    const warnings: string[] = [];

    if (scan.cookies.missingSecure > 0) {
      findings.push({
        id: randomUUID(),
        category: "session_management",
        severity: "high",
        title: "Session-related cookies are missing the Secure attribute",
        summary:
          "The passive baseline observed one or more cookies without the Secure flag, which weakens transport guarantees for browser-held state.",
        evidence: [`missingSecure=${scan.cookies.missingSecure}`],
        remediation:
          "Set Secure on session and sensitive cookies and ensure the application terminates on HTTPS before issuing stateful cookies.",
        safeRetest:
          "Fetch the application again over HTTPS and confirm every session-related Set-Cookie header includes Secure.",
        supportingEventIds: []
      });
      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "high",
        category: "session_management",
        message: "One or more cookies were missing the Secure attribute.",
        metadata: {
          missingSecure: scan.cookies.missingSecure
        }
      });
    }

    if (scan.cookies.missingHttpOnly > 0) {
      findings.push({
        id: randomUUID(),
        category: "session_management",
        severity: "medium",
        title: "One or more cookies are missing HttpOnly",
        summary:
          "Cookies observed without HttpOnly may be accessible to browser-side scripts and can increase the blast radius of client-side injection bugs.",
        evidence: [`missingHttpOnly=${scan.cookies.missingHttpOnly}`],
        remediation:
          "Mark session cookies as HttpOnly unless the application has a documented and justified client-side requirement.",
        safeRetest:
          "Repeat the baseline request and confirm the relevant Set-Cookie headers now include HttpOnly.",
        supportingEventIds: []
      });
      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "medium",
        category: "session_management",
        message: "One or more cookies were missing HttpOnly.",
        metadata: {
          missingHttpOnly: scan.cookies.missingHttpOnly
        }
      });
    }

    if (scan.cookies.missingSameSite > 0) {
      findings.push({
        id: randomUUID(),
        category: "session_management",
        severity: "medium",
        title: "One or more cookies are missing SameSite",
        summary:
          "Missing SameSite can weaken browser-assisted defenses against cross-site request abuse and session confusion.",
        evidence: [`missingSameSite=${scan.cookies.missingSameSite}`],
        remediation:
          "Set SameSite=Lax or SameSite=Strict for session cookies unless the application has an explicit cross-site workflow that requires a narrower exception.",
        safeRetest:
          "Fetch the same pages again and confirm session cookies now advertise a deliberate SameSite policy.",
        supportingEventIds: []
      });
      await this.logEvent(state.runId, {
        eventType: "finding",
        severity: "medium",
        category: "session_management",
        message: "One or more cookies were missing SameSite.",
        metadata: {
          missingSameSite: scan.cookies.missingSameSite
        }
      });
    }

    const loginCandidates = this.collectPageUrls(scan).filter((url) =>
      /(login|signin|auth)/i.test(url.pathname)
    );
    for (const candidate of loginCandidates.slice(0, 2)) {
      const probe = await this.performProbe(state, candidate, {
        category: "session_management",
        label: "login-cache-check"
      });

      if (!probe) {
        warnings.push("Session probes stopped after reaching the request budget.");
        break;
      }

      const cacheControl = probe.headers.get("cache-control") ?? "";
      if (!/(no-store|private)/i.test(cacheControl)) {
        findings.push({
          id: randomUUID(),
          category: "session_management",
          severity: "low",
          title: "Login-related response is missing clear anti-caching directives",
          summary:
            "A login-oriented response did not advertise no-store or private caching semantics, which can complicate browser and intermediary handling of authentication pages.",
          evidence: [
            `endpoint=${probe.finalUrl}`,
            `cacheControl=${cacheControl || "<absent>"}`
          ],
          remediation:
            "Apply explicit cache-control headers to login, logout, and account bootstrap pages so sensitive content is not retained unnecessarily.",
          safeRetest:
            "Request the same login page and confirm the response now includes no-store or another deliberate non-cacheable policy.",
          supportingEventIds: [probe.eventId]
        });
        await this.logEvent(state.runId, {
          eventType: "finding",
          severity: "low",
          category: "session_management",
          message: "A login-related response was missing clear anti-caching directives.",
          metadata: {
            endpoint: probe.finalUrl,
            cacheControl: cacheControl || "<absent>"
          }
        });
      }
    }

    return { findings, warnings };
  }

  private async performProbe(
    state: RunState,
    url: URL,
    input: {
      category: AuthorizedSecurityTestModule;
      label: string;
      method?: "GET" | "HEAD" | "OPTIONS";
      headers?: Record<string, string>;
      authProfile?: AuthorizedSecurityTestAuthProfile;
    }
  ): Promise<ProbeResponseSummary | null> {
    if (url.origin !== state.requestedUrl.origin) {
      throw new AppError("Active testing is limited to same-origin requests only.", 400, {
        expectedOrigin: state.requestedUrl.origin,
        receivedOrigin: url.origin
      });
    }

    await this.assertSafePublicUrl(url);

    state.requestsSent += 1;
    const method = input.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "text/html,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": "CognexaSecurityAILab/1.0 (Authorized Safe Testing)",
      ...input.headers
    };

    if (input.authProfile?.headers) {
      Object.assign(headers, input.authProfile.headers);
    }

    if (input.authProfile?.cookies && Object.keys(input.authProfile.cookies).length > 0) {
      headers.Cookie = Object.entries(input.authProfile.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    const cacheKey = this.buildProbeCacheKey(url, method, headers);
    const cached = state.probeCache.get(cacheKey);
    if (cached) {
      state.probeCacheHits += 1;
      const cacheEvent = await this.logEvent(state.runId, {
        eventType: "request",
        severity: "info",
        category: input.category,
        message: `Read-only ${input.label} probe reused a cached response.`,
        metadata: {
          method,
          requestedUrl: url.toString(),
          finalUrl: cached.finalUrl,
          status: cached.status,
          cacheHit: true,
          sourceEventId: cached.eventId,
          profile: this.summarizeProbeProfile(input.authProfile)
        }
      });

      return {
        ...cached,
        eventId: cacheEvent.id
      };
    }

    const inFlight = state.pendingProbeCache.get(cacheKey);
    if (inFlight) {
      state.probeCacheHits += 1;
      const cachedResponse = await inFlight;
      if (!cachedResponse) {
        return null;
      }

      const cacheEvent = await this.logEvent(state.runId, {
        eventType: "request",
        severity: "info",
        category: input.category,
        message: `Read-only ${input.label} probe reused an in-flight response.`,
        metadata: {
          method,
          requestedUrl: url.toString(),
          finalUrl: cachedResponse.finalUrl,
          status: cachedResponse.status,
          cacheHit: true,
          sourceEventId: cachedResponse.eventId,
          profile: this.summarizeProbeProfile(input.authProfile)
        }
      });

      return {
        ...cachedResponse,
        eventId: cacheEvent.id
      };
    }

    state.probeCacheMisses += 1;
    const probePromise = this.executeNetworkProbe(state, url, input, headers, method);
    state.pendingProbeCache.set(cacheKey, probePromise);

    try {
      const probe = await probePromise;
      if (probe) {
        state.probeCache.set(cacheKey, probe);
      }

      return probe;
    } finally {
      state.pendingProbeCache.delete(cacheKey);
    }
  }

  private async executeNetworkProbe(
    state: RunState,
    url: URL,
    input: {
      category: AuthorizedSecurityTestModule;
      label: string;
      authProfile?: AuthorizedSecurityTestAuthProfile;
    },
    headers: Record<string, string>,
    method: "GET" | "HEAD" | "OPTIONS"
  ): Promise<ProbeResponseSummary | null> {
    const hasBudget = await this.reserveProbeSlot(state);
    if (!hasBudget) {
      return null;
    }

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.waitForAdaptiveWindow(state);
      response = await this.fetchWithRedirects(state, url, {
        method,
        headers,
        origin: state.requestedUrl.origin
      });

      if (![429, 503].includes(response.status) || attempt === 2) {
        break;
      }

      const backoffMs = this.applyAdaptiveBackoff(state, response);
      await this.logEvent(state.runId, {
        eventType: "warning",
        severity: "medium",
        category: input.category,
        message: `Received ${response.status} from a read-only probe and applied adaptive backoff.`,
        metadata: {
          requestedUrl: url.toString(),
          status: response.status,
          backoffMs,
          attempt: attempt + 1
        }
      });
    }

    const finalResponse = response;
    if (!finalResponse) {
      throw new AppError("Failed to execute a read-only active probe.", 502, {
        url: url.toString(),
        reason: "no_response"
      });
    }

    const contentType = finalResponse.headers.get("content-type") ?? "";
    const body =
      method === "HEAD" ? "" : (await finalResponse.text()).slice(0, 25000);
    const event = await this.logEvent(state.runId, {
      eventType: "request",
      severity: "info",
      category: input.category,
      message: `Read-only ${input.label} request completed.`,
      metadata: {
        method,
        requestedUrl: url.toString(),
        finalUrl: finalResponse.url,
        status: finalResponse.status,
        cacheHit: false,
        profile: this.summarizeProbeProfile(input.authProfile)
      }
    });

    return {
      eventId: event.id,
      requestedUrl: url.toString(),
      finalUrl: finalResponse.url,
      status: finalResponse.status,
      contentType,
      headers: finalResponse.headers,
      body,
      bodyHash: this.hashBody(body)
    };
  }

  private async fetchWithRedirects(
    state: RunState,
    url: URL,
    input: {
      method: "GET" | "HEAD" | "OPTIONS";
      headers: Record<string, string>;
      origin: string;
    }
  ): Promise<Response> {
    let current = new URL(url);
    for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        state.networkRequestsSent += 1;
        const response = await this.fetchImpl(current, {
          method: input.method,
          redirect: "manual",
          signal: controller.signal,
          headers: input.headers
        });
        clearTimeout(timeout);

        if (![301, 302, 303, 307, 308].includes(response.status)) {
          return response;
        }

        const location = response.headers.get("location");
        if (!location) {
          return response;
        }

        const next = new URL(location, current);
        if (next.origin !== input.origin) {
          throw new AppError("Redirects to a different origin are blocked during active testing.", 403, {
            from: current.toString(),
            to: next.toString()
          });
        }

        await this.assertSafePublicUrl(next);
        current = next;
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof AppError) {
          throw error;
        }

        throw new AppError("Failed to execute a read-only active probe.", 502, {
          url: current.toString(),
          reason: error instanceof Error ? error.message : "unknown"
        });
      }
    }

    throw new AppError("Too many redirects during active testing.", 502, {
      url: url.toString()
    });
  }

  private summarizeProbeProfile(profile?: AuthorizedSecurityTestAuthProfile) {
    if (!profile) {
      return undefined;
    }

    return {
      name: profile.name,
      role: profile.role,
      headerNames: Object.keys(profile.headers ?? {}),
      cookieNames: Object.keys(profile.cookies ?? {})
    };
  }

  private buildProbeCacheKey(
    url: URL,
    method: "GET" | "HEAD" | "OPTIONS",
    headers: Record<string, string>
  ): string {
    const normalizedHeaders = Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key.toLowerCase(), value]);

    return JSON.stringify({
      method,
      url: url.toString(),
      headers: normalizedHeaders
    });
  }

  private async reserveProbeSlot(state: RunState): Promise<boolean> {
    let releaseCurrentReservation!: () => void;
    const previousReservation = state.requestReservationQueue;
    state.requestReservationQueue = new Promise<void>((resolve) => {
      releaseCurrentReservation = resolve;
    });

    await previousReservation;

    try {
      if (state.requestsSent >= state.maxRequests) {
        return false;
      }

      state.requestsSent += 1;
      return true;
    } finally {
      releaseCurrentReservation();
    }
  }

  private async waitForAdaptiveWindow(state: RunState): Promise<void> {
    const delayMs = state.nextAllowedProbeAt - Date.now();
    if (delayMs > 0) {
      await this.wait(delayMs);
    }
  }

  private applyAdaptiveBackoff(state: RunState, response: Response): number {
    state.rateLimitedResponses += 1;
    state.adaptiveBackoffCount += 1;

    const retryAfterMs = this.parseRetryAfterMs(response.headers.get("retry-after"));
    const exponentialBackoffMs = Math.min(
      4000,
      250 * 2 ** Math.max(0, state.adaptiveBackoffCount - 1)
    );
    const backoffMs = Math.max(retryAfterMs, exponentialBackoffMs);

    state.nextAllowedProbeAt = Math.max(
      state.nextAllowedProbeAt,
      Date.now() + backoffMs
    );

    return backoffMs;
  }

  private parseRetryAfterMs(value: string | null): number {
    if (!value) {
      return 0;
    }

    const asSeconds = Number(value);
    if (Number.isFinite(asSeconds) && asSeconds > 0) {
      return Math.trunc(asSeconds * 1000);
    }

    const asDate = Date.parse(value);
    if (Number.isNaN(asDate)) {
      return 0;
    }

    return Math.max(0, asDate - Date.now());
  }

  private wait(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private buildGuardrails(
    maxRequests: number,
    developmentLocalTarget = false,
    developmentVerificationBypass = false
  ): string[] {
    return [
      developmentLocalTarget
        ? "Development local-target mode is active for this run and limits requests to the exact localhost or private hostname that was explicitly approved in development."
        : developmentVerificationBypass
          ? "Development verification bypass is active for this run and only applies because the backend is in development, the bypass env flag is enabled, and the hostname matched the explicit allowlist."
        : "Requests are limited to verified public hostnames only.",
      "Execution is restricted to the original origin and to read-only GET, HEAD, and OPTIONS methods.",
      "The module does not submit credentials, upload files, change data, brute-force accounts, or execute destructive payloads.",
      `The run stops after ${maxRequests} probe requests to preserve reversibility and auditability.`,
      "Potential exploit chains are modeled from confirmed findings instead of being executed destructively."
    ];
  }

  private resolveModuleConcurrency(
    maxRequests: number,
    plannedStepCount: number
  ): number {
    if (plannedStepCount <= 1) {
      return 1;
    }

    if (maxRequests >= 24) {
      return Math.min(3, plannedStepCount);
    }

    if (maxRequests >= 12) {
      return Math.min(2, plannedStepCount);
    }

    return 1;
  }

  private buildModulePriorities(
    scan: WebsiteScanResult,
    modules: AuthorizedSecurityTestModule[],
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): AuthorizedSecurityModulePriority[] {
    const pageUrls = this.collectPageUrls(scan);
    const parameterCandidates = this.buildParameterizedCandidates(pageUrls, [
      "search",
      "filter",
      "query",
      "item",
      "user",
      "order",
      "product",
      "details"
    ]);
    const protectedCandidates = this.buildProtectedRouteCandidates(scan);
    const loginSurfaceDetected =
      scan.surface.loginForms > 0 ||
      pageUrls.some((url) => /(login|signin|auth)/i.test(url.pathname));
    const adminSurfaceDetected = protectedCandidates.some((candidate) =>
      /(admin|users|roles|permissions|settings|manage)/i.test(candidate.pathname)
    );
    const apiSurfaceDetected =
      this.buildApiCandidates(scan).length > 0 ||
      pageUrls.some((url) => /^\/api(\/|$)/i.test(url.pathname));
    const weakCookieSignals =
      scan.cookies.missingSecure +
      scan.cookies.missingHttpOnly +
      scan.cookies.missingSameSite;
    const comparisonProfilesPresent =
      authProfiles.some((profile) => profile.role === "high_privilege") &&
      authProfiles.some((profile) => profile.role !== "high_privilege");

    return modules
      .map((module, index) => {
        let score = MODULE_PRIORITY_BASE_SCORES[module];
        const reasons: string[] = [];

        switch (module) {
          case "sql_injection":
            if (parameterCandidates.length > 0) {
              score += 10;
              reasons.push(
                "The passive baseline discovered query-driven or parameterized pages worth probing first."
              );
            }
            if (adminSurfaceDetected) {
              score += 4;
              reasons.push(
                "Privileged-looking routes were discovered, increasing the impact of backend query flaws."
              );
            }
            break;
          case "xss":
            if (parameterCandidates.length > 0) {
              score += 9;
              reasons.push(
                "The passive baseline discovered reflection candidates that can be checked with inert markers."
              );
            }
            if (scan.surface.inlineScripts > 0 || scan.surface.thirdPartyScripts > 0) {
              score += 5;
              reasons.push(
                "Client-side script surface was present, which increases the value of output-encoding checks."
              );
            }
            break;
          case "authentication":
            if (loginSurfaceDetected) {
              score += 10;
              reasons.push(
                "Login or sign-in surface was discovered in the passive baseline."
              );
            }
            if (adminSurfaceDetected) {
              score += 6;
              reasons.push(
                "Protected-looking routes were discovered and should be challenged early."
              );
            }
            break;
          case "authorization":
            if (comparisonProfilesPresent) {
              score += 14;
              reasons.push(
                "Differential auth profiles are available, so role-boundary checks can produce higher-confidence results."
              );
            }
            if (adminSurfaceDetected) {
              score += 8;
              reasons.push(
                "Admin-like routes were discovered and are good candidates for privilege-differential checks."
              );
            }
            break;
          case "api_security":
            if (apiSurfaceDetected) {
              score += 12;
              reasons.push(
                "API-oriented routes or documentation paths were discovered during passive scanning."
              );
            }
            if (scan.headers.accessControlAllowOrigin || scan.headers.accessControlAllowCredentials) {
              score += 4;
              reasons.push(
                "CORS-related headers were already present in the baseline and should be validated."
              );
            }
            break;
          case "waf":
            if (parameterCandidates.length > 0 || apiSurfaceDetected) {
              score += 6;
              reasons.push(
                "Multiple benign request shapes are available for normalization consistency checks."
              );
            }
            if (scan.transport.redirectedToHttps) {
              score += 2;
              reasons.push(
                "The application already uses edge redirect behavior, which is relevant to perimeter normalization checks."
              );
            }
            break;
          case "session_management":
            if (weakCookieSignals > 0) {
              score += Math.min(12, weakCookieSignals * 3);
              reasons.push(
                "The passive baseline already observed weak cookie attributes that should be confirmed and prioritized."
              );
            }
            if (loginSurfaceDetected) {
              score += 6;
              reasons.push(
                "Login-related responses were discovered and can be checked for cache and session hardening."
              );
            }
            break;
        }

        return {
          module,
          score,
          reasons:
            reasons.length > 0
              ? reasons
              : ["This module was explicitly requested for the guarded run."],
          originalIndex: index
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.originalIndex - right.originalIndex;
      })
      .map(({ module, score, reasons }) => ({
        module,
        score,
        reasons
      }));
  }

  private prioritizePlanSteps(
    steps: AuthorizedSecurityPlanStep[],
    priorities: AuthorizedSecurityModulePriority[]
  ): AuthorizedSecurityPlanStep[] {
    const priorityByModule = new Map(
      priorities.map((priority) => [priority.module, priority.score])
    );

    return [...steps]
      .map((step, index) => ({
        step,
        index,
        score: priorityByModule.get(step.category) ?? 0
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.index - right.index;
      })
      .map(({ step }) => step);
  }

  private async buildPlan(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    modules: AuthorizedSecurityTestModule[]
  ): Promise<{
    source: "ai" | "deterministic";
    steps: AuthorizedSecurityPlanStep[];
  }> {
    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are planning an authorized, non-destructive security test against a verified public application. Only propose read-only GET, HEAD, or OPTIONS requests. Never suggest payload execution, persistence, brute force, data mutation, or destructive chaining."
            },
            {
              role: "user",
              content: JSON.stringify({
                target: baseline,
                requestedModules: modules
              })
            }
          ]
        },
        AI_PLAN_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.plan",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI planning for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false
          }
        }
      );

      return {
        source: "ai",
        steps: result.steps.map((step, index) => ({
          id: `plan-${index + 1}`,
          category: step.category,
          title: step.title,
          objective: step.objective,
          safeMethod: step.safeMethod,
          stopConditions: step.stopConditions
        }))
      };
    } catch {
      return {
        source: "deterministic",
        steps: modules.map((module, index) => ({
          id: `plan-${index + 1}`,
          category: module,
          title: this.defaultPlanTitle(module),
          objective: this.defaultPlanObjective(module),
          safeMethod: this.defaultPlanMethod(module),
          stopConditions: [
            "Stop if the request budget is exhausted.",
            "Stop if the target redirects off-origin or resolves to a blocked address.",
            "Stop if the response behavior suggests a state-changing flow."
          ]
        }))
      };
    }
  }

  private async buildAdaptiveFollowUp(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    scan: WebsiteScanResult,
    executedPlan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[],
    state: RunState,
    authProfiles: AuthorizedSecurityTestAuthProfile[]
  ): Promise<AdaptiveFollowUpPlan> {
    if (findings.length === 0) {
      return {
        decisions: [],
        steps: []
      };
    }

    const candidateModules = AUTHORIZED_SECURITY_TEST_MODULES.filter(
      (module) => !executedPlan.some((step) => step.category === module)
    );
    const remainingBudget = Math.max(0, state.maxRequests - state.requestsSent);
    const comparisonProfilesPresent =
      authProfiles.some((profile) => profile.role === "high_privilege") &&
      authProfiles.some((profile) => profile.role !== "high_privilege");

    if (candidateModules.length === 0 || remainingBudget < 4) {
      return {
        decisions: [],
        steps: []
      };
    }

    const maxModules = remainingBudget >= 12 ? 2 : 1;
    const fallbackDecisions = this.normalizeAdaptiveDecisions(
      this.buildHeuristicAdaptiveDecisionCandidates(
        scan,
        findings,
        candidateModules,
        comparisonProfilesPresent
      ),
      candidateModules,
      findings,
      comparisonProfilesPresent,
      "heuristic"
    ).slice(0, maxModules);

    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are adapting an authorized, read-only security test mid-run. Select zero to three follow-up modules only when the observed findings justify deeper, still non-destructive validation. Stay within GET, HEAD, and OPTIONS only. Prefer no follow-up if the current evidence does not clearly justify one."
            },
            {
              role: "user",
              content: JSON.stringify({
                baseline,
                remainingBudget,
                candidateModules,
                comparisonProfilesPresent,
                executedModules: executedPlan.map((step) => step.category),
                findings: findings.map((finding) => ({
                  id: finding.id,
                  category: finding.category,
                  severity: finding.severity,
                  title: finding.title,
                  summary: finding.summary,
                  apiVulnerabilityType: finding.apiDetails?.vulnerabilityType
                }))
              })
            }
          ]
        },
        AI_ADAPTATION_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.adapt_plan",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI adaptation for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false,
            remainingBudget,
            candidateModules,
            findings: findings.length
          }
        }
      );

      const aiDecisions = this.normalizeAdaptiveDecisions(
        result.decisions,
        candidateModules,
        findings,
        comparisonProfilesPresent,
        "ai"
      ).slice(0, maxModules);

      if (aiDecisions.length > 0) {
        return this.materializeAdaptiveFollowUp(actor, baseline, aiDecisions);
      }
    } catch {
      // Fall back to deterministic adaptation.
    }

    return this.materializeAdaptiveFollowUp(actor, baseline, fallbackDecisions);
  }

  private buildHeuristicAdaptiveDecisionCandidates(
    scan: WebsiteScanResult,
    findings: AuthorizedSecurityFinding[],
    candidateModules: AuthorizedSecurityTestModule[],
    comparisonProfilesPresent: boolean
  ): AdaptiveDecisionCandidate[] {
    const byCategory = new Map<AuthorizedSecurityTestModule, AuthorizedSecurityFinding[]>();
    for (const finding of findings) {
      const bucket = byCategory.get(finding.category) ?? [];
      bucket.push(finding);
      byCategory.set(finding.category, bucket);
    }

    const candidateSet = new Set(candidateModules);
    const parameterSurfaceDetected =
      this.buildParameterizedCandidates(this.collectPageUrls(scan), [
        "search",
        "filter",
        "query",
        "item",
        "user",
        "order",
        "product",
        "details"
      ]).length > 0;
    const decisions: AdaptiveDecisionCandidate[] = [];
    const seen = new Set<AuthorizedSecurityTestModule>();
    const addDecision = (
      module: AuthorizedSecurityTestModule,
      rationale: string,
      triggerFindings: AuthorizedSecurityFinding[],
      urgency: "low" | "medium" | "high"
    ) => {
      if (!candidateSet.has(module) || seen.has(module) || triggerFindings.length === 0) {
        return;
      }

      decisions.push({
        module,
        rationale,
        triggerFindingIds: triggerFindings.map((finding) => finding.id),
        urgency
      });
      seen.add(module);
    };

    if (comparisonProfilesPresent) {
      addDecision(
        "authorization",
        "Anonymous access or unsafe API access signals justify an immediate privilege-differential follow-up while the run context is still warm.",
        [
          ...(byCategory.get("authentication") ?? []),
          ...findings.filter(
            (finding) =>
              finding.category === "api_security" &&
              ["auth_bypass", "idor", "data_leakage"].includes(
                finding.apiDetails?.vulnerabilityType ?? ""
              )
          )
        ],
        "high"
      );
    }

    addDecision(
      "api_security",
      "Backend input-handling or access-boundary signals justify a read-only API follow-up to map adjacent endpoints and trust boundaries.",
      [
        ...(byCategory.get("sql_injection") ?? []),
        ...(byCategory.get("authorization") ?? [])
      ],
      "high"
    );

    addDecision(
      "session_management",
      "A reflection signal is more valuable when paired with session and cookie hardening evidence from the same application flow.",
      byCategory.get("xss") ?? [],
      "medium"
    );

    if (parameterSurfaceDetected) {
      addDecision(
        "xss",
        "Weak session posture plus parameterized user-facing routes justify a non-executable reflection check on the same surface.",
        byCategory.get("session_management") ?? [],
        "medium"
      );
    }

    return decisions;
  }

  private normalizeAdaptiveDecisions(
    candidates: AdaptiveDecisionCandidate[],
    candidateModules: AuthorizedSecurityTestModule[],
    findings: AuthorizedSecurityFinding[],
    comparisonProfilesPresent: boolean,
    source: "ai" | "heuristic"
  ): AuthorizedSecurityAdaptationDecision[] {
    const candidateSet = new Set(candidateModules);
    const findingById = new Map(findings.map((finding) => [finding.id, finding]));
    const fallbackTriggerIds = findings.slice(0, 2).map((finding) => finding.id);
    const decisions: AuthorizedSecurityAdaptationDecision[] = [];
    const seen = new Set<AuthorizedSecurityTestModule>();

    for (const candidate of candidates) {
      if (!candidateSet.has(candidate.module) || seen.has(candidate.module)) {
        continue;
      }

      if (candidate.module === "authorization" && !comparisonProfilesPresent) {
        continue;
      }

      const triggerFindingIds = candidate.triggerFindingIds.filter((findingId) =>
        findingById.has(findingId)
      );
      const resolvedTriggerFindingIds =
        triggerFindingIds.length > 0 ? triggerFindingIds : fallbackTriggerIds;
      const triggerCategories = this.uniqueModules(
        resolvedTriggerFindingIds.flatMap((findingId) => {
          const finding = findingById.get(findingId);
          return finding ? [finding.category] : [];
        })
      );

      decisions.push({
        id: randomUUID(),
        module: candidate.module,
        source,
        rationale: candidate.rationale,
        triggerFindingIds: resolvedTriggerFindingIds,
        triggerCategories,
        urgency: candidate.urgency
      });
      seen.add(candidate.module);
    }

    return decisions;
  }

  private async materializeAdaptiveFollowUp(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    decisions: AuthorizedSecurityAdaptationDecision[]
  ): Promise<AdaptiveFollowUpPlan> {
    if (decisions.length === 0) {
      return {
        decisions: [],
        steps: []
      };
    }

    const modules = this.uniqueModules(decisions.map((decision) => decision.module));
    const planning = await this.buildPlan(actor, baseline, modules);
    const plannedStepByModule = new Map(
      planning.steps.map((step) => [step.category, step] as const)
    );

    return {
      decisions,
      steps: modules.map((module, index) => {
        const plannedStep = plannedStepByModule.get(module);
        return {
          id: `adapt-${index + 1}`,
          category: module,
          title: plannedStep?.title ?? this.defaultPlanTitle(module),
          objective: plannedStep?.objective ?? this.defaultPlanObjective(module),
          safeMethod: plannedStep?.safeMethod ?? this.defaultPlanMethod(module),
          stopConditions:
            plannedStep?.stopConditions ?? this.defaultStopConditions()
        };
      })
    };
  }

  private async validateFindings(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    plan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[]
  ): Promise<AuthorizedSecurityFinding[]> {
    if (findings.length === 0) {
      return [];
    }

    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are reviewing findings from an authorized, read-only security test. Reduce false positives by classifying each supplied finding as confirmed, needs_review, or unlikely. Only score the findings you were given. Do not invent new findings or recommend destructive validation."
            },
            {
              role: "user",
              content: JSON.stringify({
                baseline,
                plan,
                findings: findings.map((finding) => ({
                  id: finding.id,
                  category: finding.category,
                  severity: finding.severity,
                  title: finding.title,
                  summary: finding.summary,
                  evidence: finding.evidence,
                  supportingEventIds: finding.supportingEventIds
                }))
              })
            }
          ]
        },
        AI_FINDING_VALIDATION_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.validate_findings",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI finding validation for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false,
            findings: findings.length
          }
        }
      );

      const validationByFindingId = new Map(
        result.validations.map((validation) => [validation.findingId, validation])
      );

      return findings.map((finding) => {
        const validation = validationByFindingId.get(finding.id);
        if (!validation) {
          return {
            ...finding,
            validation: this.buildHeuristicFindingValidation(finding)
          };
        }

        return {
          ...finding,
          validation: {
            source: "ai",
            disposition: validation.disposition,
            confidence: validation.confidence,
            rationale: validation.rationale
          }
        };
      });
    } catch {
      return findings.map((finding) => ({
        ...finding,
        validation: this.buildHeuristicFindingValidation(finding)
      }));
    }
  }

  private buildHeuristicFindingValidation(
    finding: AuthorizedSecurityFinding
  ): AuthorizedSecurityFinding["validation"] {
    let confidence =
      finding.severity === "high"
        ? 78
        : finding.severity === "medium"
          ? 66
          : finding.severity === "low"
            ? 58
            : 52;
    const reasons: string[] = [];

    if (finding.evidence.length >= 3) {
      confidence += 8;
      reasons.push("The finding includes multiple independent evidence points.");
    } else if (finding.evidence.length >= 1) {
      confidence += 4;
      reasons.push("The finding includes direct probe evidence.");
    }

    if (finding.supportingEventIds.length >= 2) {
      confidence += 6;
      reasons.push("More than one probe event supported the result.");
    }

    if (
      /(potential|appears|may|might|can indicate|resembles)/i.test(
        `${finding.title} ${finding.summary}`
      )
    ) {
      confidence -= 8;
      reasons.push("The wording indicates an indirect or inference-based signal.");
    }

    if (
      /(status=5\d\d|database error|missingSecure|missingHttpOnly|missingSameSite|allowOrigin=|allowCredentials=)/i.test(
        finding.evidence.join(" ")
      )
    ) {
      confidence += 6;
      reasons.push("The evidence includes a concrete protocol or application signal.");
    }

    confidence = Math.max(25, Math.min(95, confidence));
    let disposition: AuthorizedSecurityFindingDisposition = "needs_review";
    if (confidence >= 78) {
      disposition = "confirmed";
    } else if (confidence < 50) {
      disposition = "unlikely";
    }

    return {
      source: "heuristic",
      disposition,
      confidence,
      rationale:
        reasons.length > 0
          ? reasons.join(" ")
          : "Heuristic validation could not derive stronger confidence from the current evidence."
    };
  }

  private async buildPredictions(
    actor: AccessContext,
    scan: WebsiteScanResult,
    baseline: AuthorizedSecurityBaseline,
    plan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[]
  ): Promise<AuthorizedSecurityPrediction[]> {
    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "Predict likely but unconfirmed application weaknesses from a passive baseline and confirmed read-only findings. Keep predictions defensive, bounded, and tied to a safe future check. Do not repeat already confirmed findings unless the prediction is clearly a broader follow-on risk."
            },
            {
              role: "user",
              content: JSON.stringify({
                baseline,
                plan,
                findings,
                fingerprints: scan.fingerprints,
                resources: scan.resources,
                pages: scan.pages.map((page) => ({
                  url: page.url,
                  title: page.title,
                  statusCode: page.statusCode,
                  linkCount: page.linkCount,
                  loginFormCount: page.loginFormCount,
                  inlineScriptCount: page.inlineScriptCount,
                  thirdPartyScriptCount: page.thirdPartyScriptCount
                })),
                headers: scan.headers,
                cookies: scan.cookies,
                warnings: scan.warnings
              })
            }
          ]
        },
        AI_PREDICTION_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.predict_risks",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI predictive vulnerability analysis for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false,
            findings: findings.length,
            fingerprints: scan.fingerprints.length
          }
        }
      );

      return this.normalizePredictions(
        result.predictions.map((prediction) => ({
          id: randomUUID(),
          category: prediction.category,
          title: prediction.title,
          likelihood: prediction.likelihood,
          rationale: prediction.rationale,
          indicators: prediction.indicators,
          recommendedCheck: prediction.recommendedCheck,
          source: "ai" as const
        })),
        findings
      );
    } catch {
      return this.buildHeuristicPredictions(scan, findings);
    }
  }

  private buildHeuristicPredictions(
    scan: WebsiteScanResult,
    findings: AuthorizedSecurityFinding[]
  ): AuthorizedSecurityPrediction[] {
    const actionableCategories = new Set(
      findings
        .filter((finding) => finding.validation?.disposition !== "unlikely")
        .map((finding) => finding.category)
    );
    const pageUrls = this.collectPageUrls(scan);
    const predictions: AuthorizedSecurityPrediction[] = [];
    const techHints = this.collectTechHints(scan);

    const addPrediction = (
      category: AuthorizedSecurityTestModule,
      likelihood: "low" | "medium" | "high",
      title: string,
      rationale: string,
      indicators: string[],
      recommendedCheck: string
    ) => {
      if (actionableCategories.has(category)) {
        return;
      }

      predictions.push({
        id: randomUUID(),
        category,
        title,
        likelihood,
        rationale,
        indicators,
        recommendedCheck,
        source: "heuristic"
      });
      actionableCategories.add(category);
    };

    if (
      this.buildParameterizedCandidates(pageUrls, [
        "search",
        "filter",
        "query",
        "item",
        "user",
        "order",
        "product",
        "details"
      ]).length > 0
    ) {
      addPrediction(
        "sql_injection",
        "medium",
        "Query-driven routes may hide additional unsafe backend parameter handling",
        "The passive baseline discovered search-style or parameterized routes that were not fully covered by the current read-only probes.",
        pageUrls
          .filter((url) => /(search|query|filter|item|order|product)/i.test(url.pathname))
          .slice(0, 3)
          .map((url) => url.pathname),
        "Expand the next safe run with additional read-only quote and error-differential probes across the remaining query-driven endpoints."
      );
    }

    if (
      scan.surface.inlineScripts + scan.surface.thirdPartyScripts > 0 &&
      !scan.headers.contentSecurityPolicy
    ) {
      addPrediction(
        "xss",
        scan.surface.inlineScripts > 0 ? "high" : "medium",
        "Client-side rendering paths may expose additional output-encoding weaknesses",
        "The application serves browser-executed script without a strong CSP baseline, which raises the value of broader sink and reflection coverage.",
        [
          `inlineScripts=${scan.surface.inlineScripts}`,
          `thirdPartyScripts=${scan.surface.thirdPartyScripts}`,
          `csp=${scan.headers.contentSecurityPolicy ?? "<absent>"}`
        ],
        "Target additional reflected parameters and rendered pages with inert markers and verify that HTML output is consistently encoded."
      );
    }

    if (
      scan.surface.loginForms > 0 &&
      this.buildProtectedRouteCandidates(scan).length > 0
    ) {
      addPrediction(
        "authorization",
        "medium",
        "Broader role-boundary gaps may exist beyond the currently compared routes",
        "The site exposes both login surface and privileged-looking routes, but the current run may not have covered all scoped admin or account endpoints.",
        [
          `loginForms=${scan.surface.loginForms}`,
          `protectedRoutes=${this.buildProtectedRouteCandidates(scan).length}`
        ],
        "Repeat the guarded run with more low/high privilege coverage and expand differential checks to additional account, settings, and admin API routes."
      );
    }

    if (this.buildApiCandidates(scan).length > 0 || scan.headers.accessControlAllowOrigin) {
      addPrediction(
        "api_security",
        "medium",
        "The public API edge may expose additional discovery or cross-origin weaknesses",
        `API-oriented surface was discovered${techHints.length > 0 ? ` on a stack that appears to include ${techHints.join(", ")}` : ""}.`,
        [
          `apiCandidates=${this.buildApiCandidates(scan).length}`,
          `allowOrigin=${scan.headers.accessControlAllowOrigin ?? "<absent>"}`
        ],
        "Expand safe OPTIONS and anonymous GET coverage across versioned API paths, schema endpoints, and developer routes."
      );
    }

    if (
      scan.cookies.missingSecure +
        scan.cookies.missingHttpOnly +
        scan.cookies.missingSameSite >
      0
    ) {
      addPrediction(
        "session_management",
        "high",
        "Session flow hardening may be inconsistent across additional authentication paths",
        "Weak cookie posture in the baseline often correlates with broader gaps in login caching, logout invalidation, or cross-site state protection.",
        [
          `missingSecure=${scan.cookies.missingSecure}`,
          `missingHttpOnly=${scan.cookies.missingHttpOnly}`,
          `missingSameSite=${scan.cookies.missingSameSite}`
        ],
        "Expand the next read-only run to cover logout, password reset, and account bootstrap pages for cache and cookie-control consistency."
      );
    }

    return this.normalizePredictions(predictions, findings);
  }

  private normalizePredictions(
    predictions: AuthorizedSecurityPrediction[],
    findings: AuthorizedSecurityFinding[]
  ): AuthorizedSecurityPrediction[] {
    const actionableCategories = new Set(
      findings
        .filter((finding) => finding.validation?.disposition !== "unlikely")
        .map((finding) => finding.category)
    );
    const seen = new Set<string>();

    return predictions
      .filter((prediction) => !actionableCategories.has(prediction.category))
      .filter((prediction) => {
        const key = `${prediction.category}:${prediction.title.toLowerCase()}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }

  private async buildAiAnalysis(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    plan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[],
    attackPaths: AuthorizedSecurityAttackPath[],
    predictions: AuthorizedSecurityPrediction[],
    summary: AuthorizedSecurityTestSummary
  ): Promise<AuthorizedSecurityAiAnalysis> {
    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "Summarize an authorized, read-only security test. Keep the analysis defensive, remediation-oriented, and explicit about the non-destructive boundary."
            },
            {
              role: "user",
              content: JSON.stringify({
                baseline,
                plan,
                summary,
                findings,
                attackPaths,
                predictions
              })
            }
          ]
        },
        AI_ANALYSIS_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.summarize",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI remediation analysis for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false,
            findings: findings.length
          }
        }
      );

      return {
        status: "ready",
        provider: this.options.defaultProvider,
        model: this.options.defaultModel,
        headline: result.headline,
        executiveSummary: result.executiveSummary,
        predictions,
        nextSteps: result.nextSteps
      };
    } catch (error) {
      return {
        status: "unavailable",
        predictions,
        nextSteps: summary.recommendedActions.slice(0, 5),
        unavailableReason:
          error instanceof Error
            ? error.message
            : "The configured model could not produce a structured analysis."
      };
    }
  }

  private async buildAttackPaths(
    actor: AccessContext,
    baseline: AuthorizedSecurityBaseline,
    plan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[],
    predictions: AuthorizedSecurityPrediction[]
  ): Promise<AuthorizedSecurityAttackPath[]> {
    const actionableFindings = findings.filter(
      (finding) => finding.validation?.disposition !== "unlikely"
    );

    if (actionableFindings.length === 0 && predictions.length === 0) {
      return this.buildHeuristicAttackPaths(actionableFindings, predictions);
    }

    try {
      const result = await this.llm.createStructuredOutput(
        this.options.defaultProvider,
        {
          model: this.options.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "Model realistic, testable attack chains for an authorized, read-only security assessment. Use only the supplied findings and predictions. Stay defensive, non-destructive, and explicit about safe follow-up validation."
            },
            {
              role: "user",
              content: JSON.stringify({
                baseline,
                plan,
                findings: actionableFindings,
                predictions
              })
            }
          ]
        },
        AI_ATTACK_PATH_SCHEMA,
        {
          actor,
          action: "admin.authorized_testing.model_attack_paths",
          categories: ["security_research", "vulnerability_analysis"],
          content: "AI attack-path modeling for authorized active security testing",
          metadata: {
            activeTesting: true,
            destructive: false,
            findings: actionableFindings.length,
            predictions: predictions.length
          }
        }
      );

      const validFindingIds = new Set(actionableFindings.map((finding) => finding.id));
      const attackPaths = result.attackPaths
        .map((path) => ({
          id: randomUUID(),
          title: path.title,
          status: path.status,
          narrative: path.narrative,
          supportingFindingIds: path.supportingFindingIds.filter((id) =>
            validFindingIds.has(id)
          ),
          remediationPriority: path.remediationPriority,
          safeValidation: path.safeValidation,
          source: "ai" as const,
          confidence: path.confidence
        }))
        .filter(
          (path) =>
            path.supportingFindingIds.length > 0 ||
            actionableFindings.length === 0
        );

      if (attackPaths.length > 0) {
        return attackPaths;
      }
    } catch {
      // Fall back to deterministic modeling below.
    }

    return this.buildHeuristicAttackPaths(actionableFindings, predictions);
  }

  private buildHeuristicAttackPaths(
    findings: AuthorizedSecurityFinding[],
    predictions: AuthorizedSecurityPrediction[]
  ): AuthorizedSecurityAttackPath[] {
    const byCategory = new Map<AuthorizedSecurityTestModule, AuthorizedSecurityFinding[]>();
    for (const finding of findings) {
      const bucket = byCategory.get(finding.category) ?? [];
      bucket.push(finding);
      byCategory.set(finding.category, bucket);
    }

    const attackPaths: AuthorizedSecurityAttackPath[] = [];
    const addPath = (
      first: AuthorizedSecurityTestModule,
      second: AuthorizedSecurityTestModule,
      status: AuthorizedSecurityAttackPathStatus,
      title: string,
      narrative: string,
      remediationPriority: "immediate" | "next" | "hardening",
      safeValidation: string,
      confidence: number
    ) => {
      const firstFindings = byCategory.get(first) ?? [];
      const secondFindings = byCategory.get(second) ?? [];
      if (firstFindings.length === 0 || secondFindings.length === 0) {
        return;
      }

      attackPaths.push({
        id: randomUUID(),
        title,
        status,
        narrative,
        supportingFindingIds: [...firstFindings, ...secondFindings].map(
          (finding) => finding.id
        ),
        remediationPriority,
        safeValidation,
        source: "heuristic",
        confidence
      });
    };

    addPath(
      "sql_injection",
      "authorization",
      "exposed",
      "Data exposure through injectable privileged endpoints",
      "A route that appears privilege-sensitive also showed signs of unsafe input handling. Together, that raises the risk of data exposure or privilege pivoting if the backend query layer trusts request data.",
      "immediate",
      "Validate the affected route with parameterized queries and re-run the same read-only probes with both privileged and lower-trust profiles.",
      84
    );
    addPath(
      "xss",
      "session_management",
      "constrained",
      "Client-side token exposure through reflected content and weak cookie posture",
      "A reflection sink combined with weak cookie controls can expand the impact of client-side issues by exposing browser-held state more broadly than intended.",
      "next",
      "Fix output encoding first, then harden cookie attributes and confirm the inert marker and cookie checks both pass.",
      72
    );
    addPath(
      "authentication",
      "authorization",
      "exposed",
      "Privilege boundary erosion across route-level access controls",
      "Protected-looking routes were not consistently challenged, and role-differential checks did not reliably reduce access. That combination can let attackers move from anonymous or low-trust views into privileged application areas.",
      "immediate",
      "Re-test the same GET requests anonymously and with the lower-trust profile after tightening route and role checks.",
      88
    );
    addPath(
      "api_security",
      "waf",
      "constrained",
      "API perimeter inconsistency at the edge",
      "A public API surface combined with inconsistent normalization behavior can create blind spots between the edge filter and the application router, even when the current probes stay read-only.",
      "hardening",
      "Re-run the benign normalization and preflight checks after aligning edge canonicalization and CORS policy.",
      69
    );

    if (attackPaths.length === 0 && predictions.length > 0) {
      const topPrediction = predictions[0]!;
      attackPaths.push({
        id: randomUUID(),
        title: `Predicted follow-on path around ${topPrediction.title.toLowerCase()}`,
        status: topPrediction.likelihood === "high" ? "constrained" : "blocked",
        narrative:
          "The current read-only run did not confirm a multi-step chain, but the remaining surface suggests a plausible follow-on path worth testing in the next guarded run.",
        supportingFindingIds: [],
        remediationPriority:
          topPrediction.likelihood === "high" ? "next" : "hardening",
        safeValidation: topPrediction.recommendedCheck,
        source: "heuristic",
        confidence: topPrediction.likelihood === "high" ? 61 : 48
      });
    }

    if (attackPaths.length === 0) {
      attackPaths.push({
        id: randomUUID(),
        title: "No compound attack path was confirmed within read-only coverage",
        status: "blocked",
        narrative:
          "The run stayed inside the non-destructive guardrails and did not confirm a multi-step chain from the observed findings.",
        supportingFindingIds: [],
        remediationPriority: "hardening",
        safeValidation:
          "Expand future coverage with explicit endpoint inventories and dedicated low/high privilege test accounts if deeper authorization mapping is needed.",
        source: "heuristic",
        confidence: 40
      });
    }

    return attackPaths;
  }

  private buildSummary(
    planSource: "ai" | "deterministic",
    modules: AuthorizedSecurityTestModule[],
    prioritizedModules: AuthorizedSecurityModulePriority[],
    state: RunState,
    findings: AuthorizedSecurityFinding[],
    adaptiveFollowUp: AdaptiveFollowUpPlan
  ): AuthorizedSecurityTestSummary {
    const actionableFindings = findings.filter(
      (finding) => finding.validation?.disposition !== "unlikely"
    );
    const counts: AuthorizedSecurityTestSummary["findingCounts"] = {
      info: 0,
      low: 0,
      medium: 0,
      high: 0
    };
    for (const finding of actionableFindings) {
      counts[finding.severity] += 1;
    }

    const findingsForRecommendations =
      actionableFindings.length > 0 ? actionableFindings : findings;
    const riskLevel = this.resolveRiskLevel(actionableFindings, counts);
    const recommendations = Array.from(
      new Set(findingsForRecommendations.map((finding) => finding.remediation))
    ).slice(0, 6);
    const uniqueModules = this.uniqueModules(modules);
    const followUpModules = adaptiveFollowUp.steps.map((step) => step.category);
    const followUpNarrative =
      followUpModules.length > 0
        ? ` and expanded into ${followUpModules.length} adaptive follow-up module${followUpModules.length === 1 ? "" : "s"}`
        : "";

    return {
      riskLevel,
      headline: `The authorized read-only test sent ${state.requestsSent} probe request(s) across ${uniqueModules.length} module(s)${followUpNarrative} and confirmed ${actionableFindings.length} actionable finding(s).`,
      planSource,
      requestBudget: state.maxRequests,
      requestsSent: state.requestsSent,
      modulesExecuted: uniqueModules,
      prioritizedModules,
      executionInsights: {
        moduleConcurrency: state.moduleConcurrency,
        probeCacheHits: state.probeCacheHits,
        probeCacheMisses: state.probeCacheMisses,
        adaptiveBackoffCount: state.adaptiveBackoffCount,
        rateLimitedResponses: state.rateLimitedResponses,
        networkRequestsSent: state.networkRequestsSent
      },
      adaptation:
        adaptiveFollowUp.decisions.length > 0
          ? {
              followUpExecuted: followUpModules,
              decisions: adaptiveFollowUp.decisions
            }
          : undefined,
      findingCounts: counts,
      recommendedActions: recommendations,
      reversible: true
    };
  }

  private buildCampaignStory(
    baseline: AuthorizedSecurityBaseline,
    plan: AuthorizedSecurityPlanStep[],
    findings: AuthorizedSecurityFinding[],
    attackPaths: AuthorizedSecurityAttackPath[],
    adaptiveFollowUp: AdaptiveFollowUpPlan
  ): AuthorizedSecurityCampaignStory {
    const actionableFindings = findings.filter(
      (finding) => finding.validation?.disposition !== "unlikely"
    );
    const topFindings = actionableFindings.slice(0, 3);
    const followUpModules = adaptiveFollowUp.steps.map((step) => step.category);
    const exposedOrConstrainedPaths = attackPaths.filter(
      (path) => path.status !== "blocked"
    );
    const planModules = this.uniqueModules(plan.map((step) => step.category));
    const topFindingCategories = this.uniqueModules(
      topFindings.map((finding) => finding.category)
    );

    return {
      headline:
        topFindings[0]?.title ??
        exposedOrConstrainedPaths[0]?.title ??
        "The guarded run completed without a confirmed exploit chain.",
      narrative:
        actionableFindings.length > 0
          ? `Passive recon on ${baseline.hostname} fed a guarded plan across ${planModules.length} read-only module(s). The run confirmed ${actionableFindings.length} actionable finding(s)${followUpModules.length > 0 ? ` and adapted into ${this.formatModuleList(followUpModules)} follow-up coverage` : ""}. ${exposedOrConstrainedPaths.length > 0 ? `The strongest modeled chain was ${exposedOrConstrainedPaths[0]!.title.toLowerCase()}.` : "No exposed multi-step chain was confirmed inside the non-destructive boundary."}`
          : `Passive recon on ${baseline.hostname} completed, but the guarded run did not confirm actionable findings inside the current read-only coverage window.`,
      chainHighlights: exposedOrConstrainedPaths
        .map((path) => path.title)
        .slice(0, 3),
      sections: [
        {
          id: "recon",
          title: "Recon",
          narrative: `The passive baseline covered ${baseline.pagesScanned} page(s) on ${baseline.hostname}, landed a security score of ${baseline.securityScore}, and established the initial surface for read-only probing.`,
          evidence: [
            `hostname=${baseline.hostname}`,
            `pagesScanned=${baseline.pagesScanned}`,
            `securityScore=${baseline.securityScore}`,
            `grade=${baseline.grade}`
          ]
        },
        {
          id: "plan",
          title: "Plan",
          narrative: `The run opened with ${planModules.length} module(s): ${this.formatModuleList(planModules)}. Each step stayed inside GET, HEAD, and OPTIONS guardrails.`,
          evidence: [
            `modules=${planModules.join(",")}`,
            `steps=${plan.length}`,
            "methods=GET,HEAD,OPTIONS"
          ]
        },
        {
          id: "execute",
          title: "Execution",
          narrative:
            actionableFindings.length > 0
              ? `Execution confirmed ${actionableFindings.length} actionable finding(s), led by ${this.formatModuleList(topFindingCategories)} signals.`
              : "Execution completed without a confirmed actionable finding under the current budget and guardrails.",
          evidence:
            actionableFindings.length > 0
              ? topFindings.map(
                  (finding) => `${finding.category}:${finding.severity}:${finding.title}`
                )
              : ["actionableFindings=0"]
        },
        {
          id: "adapt",
          title: "Adaptation",
          narrative:
            adaptiveFollowUp.decisions.length > 0
              ? `Mid-run evidence triggered follow-up coverage in ${this.formatModuleList(followUpModules)}. ${adaptiveFollowUp.decisions
                  .map(
                    (decision) =>
                      `${this.humanizeModule(decision.module)} because ${decision.rationale}`
                  )
                  .join(" ")}`
              : "The run stayed on the original plan because the observed evidence did not justify additional safe follow-up modules within the remaining budget.",
          evidence:
            adaptiveFollowUp.decisions.length > 0
              ? adaptiveFollowUp.decisions.map(
                  (decision) =>
                    `${decision.module}:${decision.source}:${decision.urgency}:${decision.triggerCategories.join("+")}`
                )
              : ["followUpModules=none"]
        },
        {
          id: "report",
          title: "Report",
          narrative:
            exposedOrConstrainedPaths.length > 0
              ? `The reporting phase modeled ${exposedOrConstrainedPaths.length} plausible chain(s), with ${exposedOrConstrainedPaths[0]!.title.toLowerCase()} as the top narrative.`
              : "The reporting phase did not confirm a compound chain and instead documented the bounded findings and next safe validation steps.",
          evidence:
            attackPaths.length > 0
              ? attackPaths.slice(0, 3).map((path) => `${path.status}:${path.title}`)
              : ["attackPaths=0"]
        }
      ]
    };
  }

  private defaultStopConditions(): string[] {
    return [
      "Stop if the request budget is exhausted.",
      "Stop if the target redirects off-origin or resolves to a blocked address.",
      "Stop if the response behavior suggests a state-changing flow."
    ];
  }

  private uniqueModules(
    modules: AuthorizedSecurityTestModule[]
  ): AuthorizedSecurityTestModule[] {
    const unique: AuthorizedSecurityTestModule[] = [];
    const seen = new Set<AuthorizedSecurityTestModule>();

    for (const module of modules) {
      if (seen.has(module)) {
        continue;
      }

      seen.add(module);
      unique.push(module);
    }

    return unique;
  }

  private humanizeModule(module: AuthorizedSecurityTestModule): string {
    return module.replace(/_/g, " ");
  }

  private formatModuleList(modules: AuthorizedSecurityTestModule[]): string {
    const labels = this.uniqueModules(modules).map((module) => this.humanizeModule(module));

    if (labels.length === 0) {
      return "no additional modules";
    }

    if (labels.length === 1) {
      return labels[0]!;
    }

    if (labels.length === 2) {
      return `${labels[0]} and ${labels[1]}`;
    }

    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }

  private resolveRiskLevel(
    findings: AuthorizedSecurityFinding[],
    counts: AuthorizedSecurityTestSummary["findingCounts"]
  ): AuthorizedSecurityRiskLevel {
    const categories = new Set(findings.map((finding) => finding.category));
    if (
      counts.high >= 2 ||
      (categories.has("sql_injection") && categories.has("authorization"))
    ) {
      return "critical";
    }

    if (counts.high >= 1) {
      return "high";
    }

    if (counts.medium >= 1) {
      return "medium";
    }

    return "low";
  }

  private buildParameterizedCandidates(
    urls: URL[],
    keywords: string[]
  ): Array<{
    url: URL;
    paramName: string;
    value: string;
  }> {
    const candidates: Array<{ url: URL; paramName: string; value: string }> = [];

    for (const original of urls) {
      const url = new URL(original);
      if ([...url.searchParams.keys()].length > 0) {
        for (const [paramName, value] of url.searchParams.entries()) {
          candidates.push({
            url,
            paramName,
            value: value || "1"
          });
        }
        continue;
      }

      const path = url.pathname.toLowerCase();
      const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
      if (keywords.some((keyword) => path.includes(keyword))) {
        candidates.push({
          url,
          paramName:
            path.includes("search") || path.includes("query")
              ? "q"
              : path.includes("redirect") ||
                  path.includes("return") ||
                  path.includes("next")
                ? "next"
                : "id",
          value: /\d+$/.test(lastSegment) ? lastSegment.match(/\d+$/)?.[0] ?? "1" : "1"
        });
      }
    }

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.url.toString()}::${candidate.paramName}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private buildProtectedRouteCandidates(scan: WebsiteScanResult): URL[] {
    const origin = new URL(scan.finalUrl).origin;
    const candidates = [
      ...this.collectPageUrls(scan),
      new URL("/admin", origin),
      new URL("/dashboard", origin),
      new URL("/account", origin),
      new URL("/settings", origin),
      new URL("/api/me", origin),
      new URL("/api/admin", origin),
      new URL("/api/users", origin)
    ];

    return this.dedupeUrls(candidates).filter((candidate) =>
      /(admin|dashboard|account|settings|profile|api\/me|api\/admin|api\/users)/i.test(
        candidate.pathname
      )
    );
  }

  private buildApiCandidates(scan: WebsiteScanResult): URL[] {
    const origin = new URL(scan.finalUrl).origin;
    const exposureCandidates = scan.exposures.endpoints
      .map((endpoint) => {
        try {
          return new URL(endpoint.url);
        } catch {
          return null;
        }
      })
      .filter((url): url is URL => Boolean(url));

    return this.dedupeUrls([
      ...exposureCandidates,
      ...this.collectPageUrls(scan).filter((url) => this.isApiLikePath(url)),
      new URL("/openapi.json", origin),
      new URL("/swagger.json", origin),
      new URL("/api-docs", origin),
      new URL("/v3/api-docs", origin),
      new URL("/graphql", origin),
      new URL("/graphiql", origin),
      new URL("/api", origin),
      new URL("/api/v1", origin),
      new URL("/api/v2", origin),
      new URL("/api/me", origin),
      new URL("/api/users", origin),
      new URL("/api/admin", origin),
      new URL("/api/profile", origin),
      new URL("/api/settings", origin),
      new URL("/api/search?q=1", origin),
      new URL("/api/redirect?next=/dashboard", origin),
      new URL("/api/users/1", origin),
      new URL("/api/orders/1", origin)
    ]).filter((url) => this.isApiLikePath(url));
  }

  private buildApiDocumentationCandidates(scan: WebsiteScanResult): URL[] {
    return this.buildApiCandidates(scan).filter((candidate) =>
      this.isApiDocumentationPath(candidate)
    );
  }

  private buildSensitiveApiRouteCandidates(scan: WebsiteScanResult): URL[] {
    const origin = new URL(scan.finalUrl).origin;
    return this.dedupeUrls([
      ...this.collectApiUrls(scan),
      new URL("/api/account", origin),
      new URL("/api/internal", origin),
      new URL("/api/config", origin)
    ]).filter(
      (candidate) =>
        !this.isApiDocumentationPath(candidate) &&
        /(?:^\/api(?:\/|$)|^\/graphql(?:\/|$))/i.test(candidate.pathname) &&
        /(admin|account|profile|config|internal|settings|users|roles|permissions|session|token|search|query|redirect|graphql|orders)/i.test(
          candidate.pathname
        )
    );
  }

  private buildApiObjectCandidates(scan: WebsiteScanResult): URL[] {
    const origin = new URL(scan.finalUrl).origin;
    return this.dedupeUrls([
      ...this.collectApiUrls(scan),
      new URL("/api/users/1", origin),
      new URL("/api/orders/1", origin),
      new URL("/api/projects/1", origin)
    ]).filter((candidate) => this.isObjectReferenceCandidate(candidate));
  }

  private collectApiUrls(scan: WebsiteScanResult): URL[] {
    return this.buildApiCandidates(scan).filter((candidate) =>
      /(?:^\/api(?:\/|$)|^\/graphql(?:\/|$))/i.test(candidate.pathname)
    );
  }

  private buildCorsCandidates(scan: WebsiteScanResult): URL[] {
    const origin = new URL(scan.finalUrl).origin;
    return this.dedupeUrls([
      ...this.collectApiUrls(scan).filter((candidate) =>
        /(?:^\/api(?:\/|$)|^\/graphql(?:\/|$))/i.test(candidate.pathname)
      ),
      new URL("/api", origin),
      new URL("/api/v1", origin),
      new URL("/graphql", origin)
    ]);
  }

  private isApiLikePath(url: URL): boolean {
    const pathname = url.pathname.toLowerCase();
    return (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname === "/graphql" ||
      pathname.startsWith("/graphql/") ||
      this.isApiDocumentationPath(url)
    );
  }

  private isApiDocumentationPath(url: URL): boolean {
    const pathname = url.pathname.toLowerCase();
    return (
      /(?:^|\/)(?:openapi(?:\.json)?|swagger(?:\.json)?|v\d+\/api-docs|api-docs|graphi?ql|playground)(?:$|\/)/i.test(
        pathname
      ) ||
      pathname === "/graphql" ||
      pathname.startsWith("/graphql/")
    );
  }

  private isApiDocumentationResponse(probe: ProbeResponseSummary): boolean {
    let matchesDocumentationPath = false;
    if (probe.finalUrl) {
      try {
        matchesDocumentationPath = this.isApiDocumentationPath(
          new URL(probe.finalUrl)
        );
      } catch {
        matchesDocumentationPath = false;
      }
    }

    return (
      matchesDocumentationPath ||
      /(openapi|swagger-ui|swagger ui|redoc|graphql playground|graphiql|apollo sandbox|\"paths\"\s*:|\"components\"\s*:)/i.test(
        probe.body
      )
    );
  }

  private isReadableApiResponse(probe: ProbeResponseSummary): boolean {
    return (
      /json|javascript|text\/plain|text\/html|graphql/i.test(probe.contentType) ||
      /^[\[{]/.test(probe.body.trim())
    );
  }

  private detectSensitiveApiFields(body: string): string[] {
    const fields = new Set<string>();
    const fieldPattern =
      /["']?(email|role|roles|permission|permissions|api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|session|tenant[_-]?id|internal[_-]?id|customer[_-]?id|password|phone|address|ssn)["']?\s*:/gi;
    let match: RegExpExecArray | null;

    while ((match = fieldPattern.exec(body)) !== null) {
      fields.add(match[1]!.toLowerCase());
      if (fields.size >= 6) {
        break;
      }
    }

    return [...fields];
  }

  private extractWritableApiSchemaFields(body: string): string[] {
    const fields = new Set<string>();
    const fieldPattern =
      /["']?(role|roles|permission|permissions|is[_-]?admin|admin|tenant[_-]?id|scope|enabled|status|plan|billing|quota|entitlement)["']?(?:\s*:|\s*$)/gim;
    let match: RegExpExecArray | null;

    while ((match = fieldPattern.exec(body)) !== null) {
      fields.add(match[1]!.toLowerCase());
      if (fields.size >= 6) {
        break;
      }
    }

    return [...fields];
  }

  private hasStateChangingApiSurface(body: string): boolean {
    return /["'](?:post|put|patch|delete)["']\s*:|\bmutation\b|^\s*(post|put|patch|delete)\s*:/gim.test(
      body
    );
  }

  private hasCookieAuthHints(body: string): boolean {
    return /(cookieauth|cookie auth|cookie|session|xsrf|csrf|set-cookie|samesite)/i.test(
      body
    );
  }

  private hasRateLimitHeaders(headers: Headers): boolean {
    return Boolean(
      headers.get("x-ratelimit-limit") ??
        headers.get("x-ratelimit-remaining") ??
        headers.get("ratelimit-limit") ??
        headers.get("ratelimit-remaining") ??
        headers.get("retry-after")
    );
  }

  private isObjectReferenceCandidate(candidate: URL): boolean {
    if (
      ["id", "userId", "accountId", "orderId", "projectId", "recordId"].some((key) =>
        candidate.searchParams.has(key)
      )
    ) {
      return true;
    }

    return /\/(?:users|accounts|orders|projects|records|customers|members|devices|profiles|tenants)\/[\w-]+$/i.test(
      candidate.pathname
    );
  }

  private collectTechHints(scan: WebsiteScanResult): string[] {
    const hints = new Set<string>();

    const addHint = (value: string | null | undefined) => {
      if (!value) {
        return;
      }

      const normalized = value
        .toLowerCase()
        .replace(/[^\w.+/-]+/g, " ")
        .trim();
      if (!normalized) {
        return;
      }

      for (const token of normalized.split(/\s+/)) {
        if (token.length < 2 || /^\d+$/.test(token)) {
          continue;
        }

        hints.add(token);
        if (hints.size >= 4) {
          return;
        }
      }
    };

    addHint(scan.headers.server);
    addHint(scan.headers.xPoweredBy);

    for (const fingerprint of scan.fingerprints) {
      addHint(fingerprint.sanitizedValue);
      if (hints.size >= 4) {
        break;
      }
    }

    return [...hints];
  }

  private collectPageUrls(scan: WebsiteScanResult): URL[] {
    return this.dedupeUrls(
      [scan.finalUrl, ...scan.pages.map((page) => page.url)].map(
        (value) => new URL(value)
      )
    );
  }

  private dedupeUrls(urls: URL[]): URL[] {
    const map = new Map<string, URL>();
    for (const url of urls) {
      url.hash = "";
      map.set(url.toString(), url);
    }

    return [...map.values()];
  }

  private looksLikeProtectedContent(
    candidate: URL,
    probe: ProbeResponseSummary
  ): boolean {
    if (probe.status === 401 || probe.status === 403) {
      return false;
    }

    if (probe.status >= 300 && probe.status < 400) {
      return false;
    }

    if (probe.status !== 200) {
      return false;
    }

    const normalizedBody = probe.body.toLowerCase();
    if (/(sign in|log in|login|authenticate)/i.test(normalizedBody)) {
      return false;
    }

    if (probe.contentType.includes("application/json")) {
      return /(email|role|permission|user|account|settings)/i.test(normalizedBody);
    }

    return /(admin|dashboard|account|settings|profile|users|permissions)/i.test(
      `${candidate.pathname} ${normalizedBody}`
    );
  }

  private normalizeRequestedUrl(rawUrl: string): { url: URL } {
    const value = rawUrl.trim();
    if (!value) {
      throw new AppError("A target URL is required.", 400);
    }

    const normalizedValue = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
      ? value
      : `https://${value}`;

    let url: URL;
    try {
      url = new URL(normalizedValue);
    } catch {
      throw new AppError("Invalid target URL.", 400, {
        url: value
      });
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new AppError("Only http and https URLs are allowed.", 400, {
        protocol: url.protocol
      });
    }

    if (url.username || url.password) {
      throw new AppError("Credentials in URLs are not allowed.", 400);
    }

    url.hash = "";
    return {
      url
    };
  }

  private normalizeModules(
    modules?: AuthorizedSecurityTestModule[]
  ): AuthorizedSecurityTestModule[] {
    if (!modules || modules.length === 0) {
      return [...AUTHORIZED_SECURITY_TEST_MODULES];
    }

    return [...new Set(modules)].slice(0, AUTHORIZED_SECURITY_TEST_MODULES.length);
  }

  private normalizeMaxPages(value?: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 4;
    }

    return Math.max(1, Math.min(8, Math.trunc(value)));
  }

  private normalizeMaxRequests(value?: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 18;
    }

    return Math.max(6, Math.min(40, Math.trunc(value)));
  }

  private normalizeAuthProfiles(
    profiles?: AuthorizedSecurityTestAuthProfile[]
  ): AuthorizedSecurityTestAuthProfile[] {
    if (!profiles) {
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
        headers: profile.headers ?? {},
        cookies: profile.cookies ?? {}
      });
    }

    return normalized;
  }

  private toRedactedAuthProfile(
    profile: AuthorizedSecurityTestAuthProfile
  ): AuthorizedSecurityTestAuthProfileSummary {
    return {
      name: profile.name,
      role: profile.role,
      headerNames: Object.keys(profile.headers ?? {}),
      cookieNames: Object.keys(profile.cookies ?? {})
    };
  }

  private toBaseline(scan: WebsiteScanResult): AuthorizedSecurityBaseline {
    return {
      requestedUrl: scan.requestedUrl,
      finalUrl: scan.finalUrl,
      hostname: scan.hostname,
      pagesScanned: scan.pagesScanned,
      maxPages: scan.maxPages,
      securityScore: scan.securityScore,
      grade: scan.grade,
      passiveWarnings: scan.warnings
    };
  }

  private toVerificationSummary(
    verification: AuthorizedDomainVerificationEntity,
    instructions: string[]
  ): DomainOwnershipVerificationSummary {
    const verificationMode = this.resolveVerificationMode(
      verification.challengeDetails
    );

    return {
      id: verification.id,
      requestedByUserId: verification.requestedByUserId,
      hostname: verification.hostname,
      method: verification.method,
      challengeToken: verification.challengeToken,
      challengeDetails: verification.challengeDetails,
      instructions,
      status:
        verification.status !== "verified" && this.isExpired(verification.expiresAt)
          ? "expired"
          : verification.status,
      verificationMode,
      bypassActive: verificationMode === "development_bypass",
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
      lastCheckedAt: verification.lastCheckedAt,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt
    };
  }

  private toReport(
    run: AuthorizedSecurityTestRunEntity,
    verification: AuthorizedDomainVerificationEntity,
    events: AuthorizedSecurityTestEventEntity[]
  ): AuthorizedSecurityTestReport {
    const instructions = this.buildChallenge(
      new URL(`https://${verification.hostname}/`),
      verification.method,
      verification.challengeToken,
      verification.challengeDetails
    ).instructions;

    return {
      runId: run.id,
      status: run.status,
      requestedByUserId: run.requestedByUserId,
      executedAt: run.startedAt ?? run.createdAt,
      completedAt: run.completedAt,
      target: {
        requestedUrl: run.targetUrl,
        hostname: run.hostname
      },
      ownership: this.toVerificationSummary(verification, instructions),
      guardrails: run.guardrails,
      authProfiles: run.redactedAuthProfiles,
      baseline: run.baseline,
      plan: run.plan,
      summary: run.summary,
      findings: run.findings,
      attackPaths: run.attackPaths,
      aiAnalysis: run.aiAnalysis,
      warnings: run.warnings,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        category: event.category,
        message: event.message,
        metadata: event.metadata,
        createdAt: event.createdAt
      }))
    };
  }

  private buildChallenge(
    url: URL,
    method: DomainOwnershipVerificationMethod,
    challengeToken: string,
    existingDetails?: Record<string, unknown>
  ): ChallengeDescriptor {
    const protocol =
      url.protocol === "http:" || url.protocol === "https:"
        ? (url.protocol as "http:" | "https:")
        : "https:";

    if (existingDetails) {
      if (this.isDevelopmentLocalChallengeDetails(existingDetails)) {
        return {
          protocol,
          challengeDetails: existingDetails,
          instructions: this.buildDevelopmentLocalChallengeInstructions(
            url.hostname
          )
        };
      }

      if (this.isDevelopmentBypassChallengeDetails(existingDetails)) {
        return {
          protocol,
          challengeDetails: existingDetails,
          instructions: this.buildDevelopmentBypassInstructions(
            url.hostname,
            typeof existingDetails.matchedDomain === "string"
              ? existingDetails.matchedDomain
              : undefined
          )
        };
      }

      return {
        protocol,
        challengeDetails: existingDetails,
        instructions: this.buildChallengeInstructions(
          url.hostname,
          method,
          existingDetails
        )
      };
    }

    switch (method) {
      case "http_file": {
        const path = "/.well-known/cognexa-security-test.txt";
        const verificationUrl = `${protocol}//${url.hostname}${path}`;
        const challengeDetails = {
          requestedUrl: url.toString(),
          path,
          verificationUrl,
          expectedValue: challengeToken
        };
        return {
          protocol,
          challengeDetails,
          instructions: this.buildChallengeInstructions(
            url.hostname,
            method,
            challengeDetails
          )
        };
      }
      case "html_meta": {
        const verificationUrl = `${protocol}//${url.hostname}/`;
        const challengeDetails = {
          requestedUrl: url.toString(),
          verificationUrl,
          metaName: "cognexa-domain-verification",
          expectedValue: challengeToken
        };
        return {
          protocol,
          challengeDetails,
          instructions: this.buildChallengeInstructions(
            url.hostname,
            method,
            challengeDetails
          )
        };
      }
      case "dns_txt":
      default: {
        const challengeDetails = {
          requestedUrl: url.toString(),
          recordName: `_cognexa-security-test.${url.hostname}`,
          expectedValue: `cognexa-verification=${challengeToken}`
        };
        return {
          protocol,
          challengeDetails,
          instructions: this.buildChallengeInstructions(
            url.hostname,
            method,
            challengeDetails
          )
        };
      }
    }
  }

  private buildDevelopmentLocalChallenge(
    url: URL,
    method: DomainOwnershipVerificationMethod,
    challengeToken: string,
    evidence: Record<string, unknown>
  ): ChallengeDescriptor {
    const protocol =
      url.protocol === "http:" || url.protocol === "https:"
        ? (url.protocol as "http:" | "https:")
        : "https:";

    return {
      protocol,
      challengeDetails: {
        mode: "development_local",
        requestedUrl: url.toString(),
        originalMethod: method,
        challengeToken,
        ...evidence
      },
      instructions: this.buildDevelopmentLocalChallengeInstructions(url.hostname)
    };
  }

  private buildDevelopmentBypassChallenge(
    url: URL,
    method: DomainOwnershipVerificationMethod,
    challengeToken: string,
    decision: VerificationBypassDecision
  ): ChallengeDescriptor {
    return {
      protocol: url.protocol === "http:" ? "http:" : "https:",
      challengeDetails: {
        mode: "development_bypass",
        requestedUrl: url.toString(),
        originalMethod: method,
        challengeToken,
        matchedDomain: decision.matchedDomain,
        reason: decision.reason
      },
      instructions: this.buildDevelopmentBypassInstructions(
        url.hostname,
        decision.matchedDomain
      )
    };
  }

  private buildChallengeInstructions(
    hostname: string,
    method: DomainOwnershipVerificationMethod,
    challengeDetails: Record<string, unknown>
  ): string[] {
    switch (method) {
      case "http_file":
        return [
          `Host a plain-text file at ${String(challengeDetails.verificationUrl)}.`,
          `Set the file body to exactly: ${String(challengeDetails.expectedValue)}.`,
          `Run verification again after the public edge is updated for ${hostname}.`
        ];
      case "html_meta":
        return [
          `Add <meta name="${String(challengeDetails.metaName)}" content="${String(
            challengeDetails.expectedValue
          )}"> to the <head> of ${String(challengeDetails.verificationUrl)}.`,
          `Deploy the change to the public edge for ${hostname}.`,
          "Run verification again after the page is live."
        ];
      case "dns_txt":
      default:
        return [
          `Create a TXT record named ${String(challengeDetails.recordName)}.`,
          `Set the TXT record value to ${String(challengeDetails.expectedValue)}.`,
          `Run verification again after DNS propagation for ${hostname}.`
        ];
    }
  }

  private buildDevelopmentLocalChallengeInstructions(hostname: string): string[] {
    return [
      `Development local-target mode auto-approved ${hostname} because AUTHORIZED_TESTING_DEV_MODE is enabled while the backend is running in development.`,
      "No external DNS, HTTP file, or HTML meta challenge is required for this hostname.",
      "Disable the flag to restore public-hostname verification requirements."
    ];
  }

  private buildDevelopmentBypassInstructions(
    hostname: string,
    matchedDomain?: string
  ): string[] {
    return [
      `Developer verification bypass auto-approved ${hostname} because ENABLE_VERIFICATION_BYPASS is enabled in development.`,
      matchedDomain
        ? `The hostname matched the allowlisted development pattern ${matchedDomain}.`
        : "The hostname matched the configured development bypass allowlist.",
      "Disable the development bypass toggle or the environment flag to restore normal DNS, HTTP file, or HTML meta verification requirements."
    ];
  }

  private buildDevelopmentBypassEvidence(
    url: URL,
    decision: VerificationBypassDecision
  ): Record<string, unknown> {
    return {
      reason: decision.reason,
      overrideCategory: "development_bypass",
      requestedUrl: url.toString(),
      hostname: url.hostname,
      matchedDomain: decision.matchedDomain
    };
  }

  private async performVerificationCheck(verification: {
    hostname: string;
    method: DomainOwnershipVerificationMethod;
    challengeToken: string;
    challengeDetails: Record<string, unknown>;
  }): Promise<{
    verified: boolean;
    evidence: Record<string, unknown>;
  }> {
    switch (verification.method) {
      case "http_file": {
        const verificationUrl = String(
          verification.challengeDetails.verificationUrl ??
            `https://${verification.hostname}/.well-known/cognexa-security-test.txt`
        );
        const response = await this.fetchVerificationUrl(new URL(verificationUrl));
        const body = (await response.text()).trim();
        const expected = String(verification.challengeDetails.expectedValue);
        return {
          verified: body === expected,
          evidence: {
            verificationUrl,
            status: response.status,
            bodyPreview: body.slice(0, 200)
          }
        };
      }
      case "html_meta": {
        const verificationUrl = String(
          verification.challengeDetails.verificationUrl ?? `https://${verification.hostname}/`
        );
        const response = await this.fetchVerificationUrl(new URL(verificationUrl));
        const body = await response.text();
        const expectedValue = String(verification.challengeDetails.expectedValue);
        const matched = new RegExp(
          `<meta[^>]+name=["']cognexa-domain-verification["'][^>]+content=["']${this.escapeRegex(
            expectedValue
          )}["']`,
          "i"
        ).test(body);
        return {
          verified: matched,
          evidence: {
            verificationUrl,
            status: response.status,
            metaMatched: matched
          }
        };
      }
      case "dns_txt":
      default: {
        const recordName = String(
          verification.challengeDetails.recordName ??
            `_cognexa-security-test.${verification.hostname}`
        );
        const expectedValue = String(
          verification.challengeDetails.expectedValue ??
            `cognexa-verification=${verification.challengeToken}`
        );
        const records = await this.resolveTxtImpl(recordName).catch(() => []);
        const flattened = records.map((parts) => parts.join(""));
        return {
          verified: flattened.includes(expectedValue),
          evidence: {
            recordName,
            observedValues: flattened
          }
        };
      }
    }
  }

  private async fetchVerificationUrl(url: URL): Promise<Response> {
    await this.assertSafePublicUrl(url);
    const response = await this.fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "CognexaSecurityAILab/1.0 (Domain Verification)"
      }
    });

    return response;
  }

  private hashBody(body: string): string {
    return createHash("sha256")
      .update(body.replace(/\s+/g, " ").trim().toLowerCase())
      .digest("hex");
  }

  private defaultPlanTitle(module: AuthorizedSecurityTestModule): string {
    switch (module) {
      case "sql_injection":
        return "Probe query-driven endpoints for error-based SQL handling";
      case "xss":
        return "Check inert reflection markers for output encoding gaps";
      case "authentication":
        return "Verify anonymous access challenges on protected-looking routes";
      case "authorization":
        return "Compare high- and lower-trust profiles on privileged routes";
      case "api_security":
        return "Inspect API schemas, differential access, and read-only endpoint hardening";
      case "waf":
        return "Review edge normalization consistency with benign request variants";
      case "session_management":
        return "Validate cookie flags and auth-page caching behavior";
      default:
        return "Run authorized safe checks";
    }
  }

  private defaultPlanObjective(module: AuthorizedSecurityTestModule): string {
    switch (module) {
      case "sql_injection":
        return "Identify response changes that suggest unsafe server-side query construction.";
      case "xss":
        return "Confirm whether non-executable HTML markers are encoded before rendering.";
      case "authentication":
        return "Ensure anonymous users are challenged before privileged content is served.";
      case "authorization":
        return "Ensure reduced-trust profiles do not receive the same content as privileged profiles.";
      case "api_security":
        return "Detect deeper API weaknesses such as data leakage, weak access control, unsafe parameter handling, and absent throttling signals.";
      case "waf":
        return "Detect inconsistent edge handling for semantically equivalent benign requests.";
      case "session_management":
        return "Validate browser cookie and cache semantics around session flows.";
      default:
        return "Run a safe defensive validation step.";
    }
  }

  private defaultPlanMethod(module: AuthorizedSecurityTestModule): string {
    switch (module) {
      case "sql_injection":
        return "Use read-only GET requests with benign quote mutations against discovered query parameters.";
      case "xss":
        return "Use inert HTML markers that never contain executable script.";
      case "authentication":
        return "Send anonymous GET requests to protected-looking routes and check for a proper challenge.";
      case "authorization":
        return "Compare GET responses from high- and lower-trust profiles without changing any state.";
      case "api_security":
        return "Use read-only GET and OPTIONS requests to compare API responses, inspect public schemas, and safely mutate inert query values.";
      case "waf":
        return "Replay safe, normalized query variants and compare status consistency.";
      case "session_management":
        return "Inspect cookie attributes and login-page caching headers from read-only requests.";
      default:
        return "Use safe read-only requests only.";
    }
  }

  private async getWorkspaceVerification(
    actor: AccessContext,
    verificationId: string
  ) {
    const verification = await this.verifications.findById(verificationId);
    if (!verification || verification.workspaceId !== actor.workspaceId) {
      throw new AppError("Domain ownership verification not found", 404);
    }

    return verification;
  }

  private async createImplicitVerificationForDevelopmentRun(
    actor: AccessContext,
    requestedUrl: URL,
    bypassDecision: VerificationBypassDecision,
    devModeBypass: boolean | undefined
  ): Promise<AuthorizedDomainVerificationEntity> {
    const targetSafety = await this.classifyTargetUrl(requestedUrl);

    if (targetSafety.mode === "development_local" || bypassDecision.active) {
      const summary = await this.startDomainVerification(actor, {
        target: requestedUrl.toString(),
        method: "dns_txt",
        devModeBypass
      });

      return this.getWorkspaceVerification(actor, summary.id);
    }

    throw new AppError(
      "Domain ownership must be verified before active testing unless development bypass is active for an allowlisted hostname.",
      400,
      {
        hostname: requestedUrl.hostname,
        developmentBypassAvailable: this.verificationBypass.getStatus().available,
        devModeBypassRequested: devModeBypass !== false
      }
    );
  }

  private async logEvent(
    runId: string,
    input: {
      eventType: "status" | "ownership" | "guardrail" | "plan" | "discovery" | "request" | "finding" | "warning" | "summary";
      severity: AuthorizedSecurityFindingSeverity;
      message: string;
      category?: AuthorizedSecurityTestModule;
      metadata?: Record<string, unknown>;
    }
  ) {
    return this.events.create({
      runId,
      eventType: input.eventType,
      severity: input.severity,
      category: input.category,
      message: input.message,
      metadata: input.metadata
    });
  }

  private isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() <= this.now().getTime();
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async assertSafePublicUrl(url: URL): Promise<void> {
    await this.classifyTargetUrl(url);
  }

  private async classifyTargetUrl(url: URL): Promise<
    | {
        mode: "public";
      }
    | {
        mode: "development_local";
        evidence: Record<string, unknown>;
      }
  > {
    if (this.isBlockedHostname(url.hostname)) {
      if (this.allowDevelopmentLocalTargets) {
        return {
          mode: "development_local",
          evidence: {
            reason: "development_local_target_override",
            overrideCategory: "blocked_hostname",
            hostname: url.hostname
          }
        };
      }

      throw new AppError("Local and private network targets are blocked.", 403, {
        hostname: url.hostname
      });
    }

    const records = await this.lookupHost(url.hostname, {
      all: true,
      verbatim: true
    }).catch(() => []);

    if (records.length === 0) {
      throw new AppError("Unable to resolve target hostname.", 400, {
        hostname: url.hostname
      });
    }

    const privateAddresses = records
      .map((record) => record.address)
      .filter((address) => this.isPrivateAddress(address));

    if (privateAddresses.length > 0) {
      if (this.allowDevelopmentLocalTargets) {
        return {
          mode: "development_local",
          evidence: {
            reason: "development_local_target_override",
            overrideCategory: "private_address",
            hostname: url.hostname,
            privateAddresses,
            resolvedAddresses: records.map((record) => record.address)
          }
        };
      }
    }

    for (const record of records) {
      if (this.isPrivateAddress(record.address)) {
        throw new AppError("Resolved address is in a blocked private range.", 403, {
          hostname: url.hostname,
          address: record.address
        });
      }
    }

    return {
      mode: "public"
    };
  }

  private isDevelopmentLocalVerification(verification: {
    challengeDetails: Record<string, unknown>;
  }): boolean {
    return this.isDevelopmentLocalChallengeDetails(verification.challengeDetails);
  }

  private isDevelopmentBypassVerification(verification: {
    challengeDetails: Record<string, unknown>;
  }): boolean {
    return this.isDevelopmentBypassChallengeDetails(verification.challengeDetails);
  }

  private isDevelopmentLocalChallengeDetails(
    challengeDetails: Record<string, unknown>
  ): boolean {
    return challengeDetails.mode === "development_local";
  }

  private isDevelopmentBypassChallengeDetails(
    challengeDetails: Record<string, unknown>
  ): boolean {
    return challengeDetails.mode === "development_bypass";
  }

  private resolveVerificationMode(
    challengeDetails: Record<string, unknown>
  ): DomainOwnershipVerificationSummary["verificationMode"] {
    if (this.isDevelopmentLocalChallengeDetails(challengeDetails)) {
      return "development_local";
    }

    if (this.isDevelopmentBypassChallengeDetails(challengeDetails)) {
      return "development_bypass";
    }

    return "standard";
  }

  private resolveVerificationRequestedUrl(verification: {
    hostname: string;
    challengeDetails: Record<string, unknown>;
  }): URL {
    const requestedUrl = verification.challengeDetails.requestedUrl;
    if (typeof requestedUrl === "string" && requestedUrl.trim()) {
      return new URL(requestedUrl);
    }

    return new URL(`https://${verification.hostname}/`);
  }

  private isBlockedHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
      normalized === "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized.endsWith(".local") ||
      normalized === "0.0.0.0" ||
      normalized === "::1" ||
      normalized === "169.254.169.254"
    );
  }

  private isPrivateAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
      return this.isPrivateIpv4(address);
    }

    if (version === 6) {
      return this.isPrivateIpv6(address);
    }

    return true;
  }

  private isPrivateIpv4(address: string): boolean {
    const [a = -1, b = -1] = address.split(".").map((segment) => Number(segment));
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
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized === "::"
    );
  }
}
