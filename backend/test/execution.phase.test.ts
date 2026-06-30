import assert from "node:assert/strict";
import test from "node:test";

import type { AccessContext } from "../src/authorization/authorization.types";
import { AppError } from "../src/utils/app-error";
import type {
  AuthorizedSecurityTestReport
} from "../src/services/authorized-testing/authorized-security-testing.types";
import type { LLMService } from "../src/services/llm/llm.service";
import { ExecutionPhase } from "../src/services/penetration-testing/phases/execution.phase";
import type {
  Attack,
  AttackPlan,
  Decision,
  PenetrationTestContext,
  Vulnerability
} from "../src/services/penetration-testing/penetration-test-orchestrator.service";

function createActor(): AccessContext {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role: "admin",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: ["admin_dashboard"]
  };
}

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function createDecision(action: string, alternative = "Continue with next planned attack"): Decision {
  return {
    id: `${action.toLowerCase().replace(/\s+/g, "-")}-decision`,
    action,
    reason: `${action} is the highest-value next step.`,
    confidence: 0.82,
    alternative,
    timestamp: new Date("2026-06-24T08:05:00.000Z")
  };
}

function createAttack(overrides: Partial<Attack> = {}): Attack {
  return {
    id: "attack-1",
    name: "Validate administrative authentication boundary",
    type: "authentication",
    target: "https://example.com/admin",
    payload: "Compare anonymous and authenticated read-only responses.",
    expectedOutcome: "Confirm whether administrative content is protected.",
    status: "pending",
    ...overrides
  };
}

function createPlan(attacks: Attack[]): AttackPlan {
  return {
    id: "plan-1",
    name: "Read-only access-control plan",
    description: "Validate authentication and authorization boundaries safely.",
    attacks,
    priority: "high",
    estimatedSuccess: 0.82
  };
}

function createPassiveAdminVulnerability(): Vulnerability {
  return {
    id: "passive-admin-surface",
    type: "authentication",
    severity: "high",
    location: "https://example.com/admin",
    description: "Privileged-looking admin route structure is visible anonymously.",
    evidence: "/admin",
    remediation: "Require authentication before privileged content renders.",
    confidence: 0.9,
    exploitable: false
  };
}

function createContext(plan: AttackPlan): PenetrationTestContext {
  return {
    target: "https://example.com",
    verificationId: "verification-1",
    startTime: new Date("2026-06-24T08:00:00.000Z"),
    reconData: {
      summary: {
        headline: "Passive review found exposed administrative surface.",
        riskLevel: "high"
      }
    },
    vulnerabilities: [createPassiveAdminVulnerability()],
    attackPlan: plan,
    executionResults: [],
    attackChains: [],
    evidence: [],
    decisions: [],
    currentPhase: "planning",
    isComplete: false
  };
}

function createAuthorizedSecurityTestReport(
  module: "authentication" | "authorization",
  overrides: Partial<AuthorizedSecurityTestReport> = {}
): AuthorizedSecurityTestReport {
  const finding =
    module === "authentication"
      ? {
          id: "active-finding-auth",
          category: "authentication" as const,
          severity: "high" as const,
          title: "Protected route appears reachable without authentication",
          summary: "Anonymous GET requests reached privileged content.",
          evidence: ["endpoint=https://example.com/admin"],
          remediation: "Require authentication at the route boundary.",
          safeRetest: "Repeat the same GET anonymously after the fix.",
          supportingEventIds: ["event-auth"],
          validation: {
            source: "ai" as const,
            disposition: "confirmed" as const,
            confidence: 91,
            rationale: "Privileged content was returned directly."
          }
        }
      : {
          id: "active-finding-authz",
          category: "authorization" as const,
          severity: "high" as const,
          title: "Lower-trust and higher-trust profiles received equivalent privileged content",
          summary: "Differential role checks did not reduce access for the lower-trust profile.",
          evidence: ["endpoint=https://example.com/admin"],
          remediation: "Enforce role checks on privileged routes.",
          safeRetest: "Compare low and high profiles again after the fix.",
          supportingEventIds: ["event-authz"],
          validation: {
            source: "ai" as const,
            disposition: "confirmed" as const,
            confidence: 89,
            rationale: "The body and status matched across profiles."
          }
        };

  return {
    runId: `authorized-run-${module}`,
    status: "completed",
    requestedByUserId: "user-1",
    executedAt: "2026-06-24T08:05:00.000Z",
    completedAt: "2026-06-24T08:06:00.000Z",
    target: {
      requestedUrl: "https://example.com",
      hostname: "example.com"
    },
    ownership: {
      id: "verification-1",
      requestedByUserId: "user-1",
      hostname: "example.com",
      method: "dns_txt",
      challengeToken: "token-1",
      challengeDetails: {
        requestedUrl: "https://example.com",
        recordName: "_security-test.example.com",
        expectedValue: "verification=token-1"
      },
      instructions: ["Create TXT record."],
      status: "verified",
      verifiedAt: "2026-06-24T07:50:00.000Z",
      expiresAt: "2026-07-24T07:50:00.000Z",
      lastCheckedAt: "2026-06-24T07:51:00.000Z",
      createdAt: "2026-06-24T07:40:00.000Z",
      updatedAt: "2026-06-24T07:51:00.000Z"
    },
    guardrails: ["GET, HEAD, and OPTIONS only."],
    authProfiles: [
      {
        name: "low",
        role: "low_privilege",
        headerNames: ["Authorization"],
        cookieNames: []
      },
      {
        name: "high",
        role: "high_privilege",
        headerNames: ["Authorization"],
        cookieNames: []
      }
    ],
    baseline: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      hostname: "example.com",
      pagesScanned: 3,
      maxPages: 4,
      securityScore: 61,
      grade: "C",
      passiveWarnings: ["Weak cookies"],
      declaredAuthEndpoints: []
    },
    plan: [
      {
        id: `plan-${module}`,
        category: module,
        title: module === "authentication" ? "Challenge protected routes" : "Compare role boundaries",
        objective:
          module === "authentication"
            ? "Ensure protected routes return a challenge."
            : "Compare low- and high-trust responses.",
        safeMethod:
          module === "authentication"
            ? "Anonymous GET only"
            : "Read-only differential GET",
        stopConditions: ["Stop at request budget."]
      }
    ],
    summary: {
      riskLevel: "high",
      headline:
        module === "authentication"
          ? "The guarded run confirmed missing authentication pressure."
          : "The guarded run confirmed missing authorization separation.",
      planSource: "ai",
      requestBudget: 9,
      requestsSent: 6,
      modulesExecuted: [module],
      findingCounts: {
        info: 0,
        low: 0,
        medium: 0,
        high: 1
      },
      recommendedActions:
        module === "authentication"
          ? ["Require authentication on privileged routes."]
          : ["Enforce role-based authorization on privileged routes."],
      reversible: true
    },
    findings: [finding],
    attackPaths: [
      {
        id: `attack-${module}`,
        title:
          module === "authentication"
            ? "Anonymous access reaches privileged routes"
            : "Low-trust access matches high-trust access",
        status: "exposed",
        narrative:
          module === "authentication"
            ? "Authentication pressure is absent on a privileged route."
            : "Authorization checks do not reduce access for the lower-trust profile.",
        supportingFindingIds: [finding.id],
        remediationPriority: "immediate",
        safeValidation:
          module === "authentication"
            ? "Repeat the same GET anonymously after the fix."
            : "Compare low and high profiles again after the fix.",
        source: "ai",
        confidence: 90
      }
    ],
    aiAnalysis: {
      status: "ready",
      provider: "qwen",
      model: "qwen2.5-coder",
      headline: "Access control should be fixed first.",
      executiveSummary: "The run stayed read-only and still confirmed privilege-boundary issues.",
      predictions: [],
      nextSteps: ["Fix auth middleware", "Retest role boundaries"]
    },
    warnings: [],
    events: [
      {
        id: `event-${module}`,
        eventType: "finding",
        severity: "high",
        category: module,
        message: "The guarded run identified an access-control weakness.",
        metadata: {},
        createdAt: "2026-06-24T08:05:30.000Z"
      }
    ],
    ...overrides
  };
}

function createNoFindingReport(): AuthorizedSecurityTestReport {
  return createAuthorizedSecurityTestReport("authentication", {
    runId: "authorized-run-no-findings",
    summary: {
      riskLevel: "low",
      headline: "The guarded run did not confirm the expected issue.",
      planSource: "ai",
      requestBudget: 9,
      requestsSent: 4,
      modulesExecuted: ["authentication"],
      findingCounts: {
        info: 0,
        low: 0,
        medium: 0,
        high: 0
      },
      recommendedActions: ["Continue with a different read-only angle."],
      reversible: true
    },
    findings: [],
    attackPaths: [],
    warnings: []
  });
}

test("ExecutionPhase executes attacks, collects evidence, and chains vulnerabilities", async () => {
  const plan = createPlan([
    createAttack({
      id: "attack-auth",
      type: "authentication"
    }),
    createAttack({
      id: "attack-authz",
      name: "Compare authorization boundaries",
      type: "authorization",
      payload: "Compare lower- and higher-trust read-only responses.",
      expectedOutcome: "Determine whether lower-trust responses lose access."
    })
  ]);
  const context = createContext(plan);
  const authenticationReport = createAuthorizedSecurityTestReport("authentication");
  const authorizationReport = createAuthorizedSecurityTestReport("authorization");
  let activeCall = 0;

  const activeTester = {
    async runAuthorizedSecurityTest(
      actor: AccessContext,
      input: { url: string; modules: string[] }
    ) {
      assert.equal(actor.userId, "user-1");
      assert.equal(input.url.startsWith("https://example.com"), true);
      activeCall += 1;
      return activeCall === 1 ? authenticationReport : authorizationReport;
    }
  };

  let decisionCall = 0;
  const decisionEngine = {
    async evaluateResult(
      _attack: Attack,
      result: { vulnerability?: Vulnerability; success: boolean }
    ) {
      return {
        success: result.success,
        insights: [result.success ? "Confirmed evidence." : "No finding confirmed."],
        nextStep: result.success
          ? "Prioritize related authorization checks."
          : "Try a different surface.",
        canEscalate: result.vulnerability?.type === "authentication",
        confidence: 0.84
      };
    },
    async decideNextAction() {
      decisionCall += 1;
      return decisionCall === 1
        ? createDecision(
            "Prioritize related authorization checks",
            "Continue with next planned attack"
          )
        : createDecision("Continue with next planned attack");
    },
    async suggestAlternative() {
      throw new Error("suggestAlternative should not be called in this test");
    }
  };

  const llm = {
    async listProviders() {
      return [
        {
          id: "qwen",
          models: ["qwen2.5-coder"]
        }
      ];
    },
    async createStructuredOutput() {
      return {
        chains: [
          {
            name: "Privilege boundary failure chain",
            impact: "critical",
            effort: "easy",
            businessImpact:
              "Anonymous route discovery plus failed authentication and authorization checks create a coherent unauthorized-access path.",
            steps: [
              {
                vulnerabilityId: "active-finding-auth",
                action: "Confirm anonymous reachability of the privileged route.",
                result: "Anonymous requests reached privileged content.",
                evidence: "endpoint=https://example.com/admin",
                nextStep: "Compare lower- and higher-trust responses."
              },
              {
                vulnerabilityId: "active-finding-authz",
                action: "Confirm role separation on the same route.",
                result:
                  "Differential role checks did not reduce access for the lower-trust profile.",
                evidence: "endpoint=https://example.com/admin",
                nextStep: "Report the confirmed access-control chain."
              }
            ]
          }
        ]
      };
    }
  } as unknown as LLMService;

  const phase = new ExecutionPhase(
    activeTester as never,
    decisionEngine as never,
    llm,
    createLogger() as never,
    {
      actor: createActor(),
      authProfiles: [
        {
          name: "low",
          role: "low_privilege",
          headers: {
            Authorization: "Bearer low"
          }
        },
        {
          name: "high",
          role: "high_privilege",
          headers: {
            Authorization: "Bearer high"
          }
        }
      ]
    }
  );

  const results = await phase.execute(plan, context);

  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.success), true);
  assert.equal(results.every((result) => result.evidence.length === 1), true);
  assert.equal(results.every((result) => result.chained === true), true);
  assert.equal(context.executionResults.length, 2);
  assert.equal(context.evidence.length, 3);
  assert.equal(context.attackChains.length, 1);
  assert.equal(
    context.vulnerabilities.some((vulnerability) => vulnerability.id === "active-finding-auth"),
    true
  );
  assert.equal(
    context.vulnerabilities.some((vulnerability) => vulnerability.id === "active-finding-authz"),
    true
  );
  assert.equal(context.decisions.length, 2);
  assert.equal(plan.attacks[0]?.status, "success");
  assert.equal(plan.attacks[1]?.status, "success");
});

test("ExecutionPhase adapts strategy by inserting an alternative attack after failure", async () => {
  const plan = createPlan([
    createAttack({
      id: "attack-auth",
      type: "authentication"
    })
  ]);
  const context = createContext(plan);
  const noFindingReport = createNoFindingReport();
  const authorizationReport = createAuthorizedSecurityTestReport("authorization");
  let activeCall = 0;

  const activeTester = {
    async runAuthorizedSecurityTest() {
      activeCall += 1;
      return activeCall === 1 ? noFindingReport : authorizationReport;
    }
  };

  let decisionCall = 0;
  const decisionEngine = {
    async evaluateResult(
      _attack: Attack,
      result: { success: boolean }
    ) {
      return {
        success: result.success,
        insights: [result.success ? "Confirmed evidence." : "No finding confirmed."],
        nextStep: result.success ? "Continue with next attack." : "Try an alternate angle.",
        canEscalate: false,
        confidence: 0.7
      };
    },
    async decideNextAction() {
      decisionCall += 1;
      return decisionCall === 1
        ? createDecision("Generate alternative attack", "Continue with next distinct safe attack")
        : createDecision("Continue with next planned attack");
    },
    async suggestAlternative() {
      return createAttack({
        id: "attack-alt-authz",
        name: "Alternative authorization validation",
        type: "authorization",
        target: "https://example.com/admin",
        payload: "Compare lower- and higher-trust read-only responses.",
        expectedOutcome: "Determine whether privilege boundaries change the response.",
        status: "pending"
      });
    }
  };

  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const phase = new ExecutionPhase(
    activeTester as never,
    decisionEngine as never,
    llm,
    createLogger() as never,
    {
      actor: createActor(),
      authProfiles: [
        {
          name: "low",
          role: "low_privilege",
          headers: {
            Authorization: "Bearer low"
          }
        },
        {
          name: "high",
          role: "high_privilege",
          headers: {
            Authorization: "Bearer high"
          }
        }
      ]
    }
  );

  const results = await phase.execute(plan, context);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.success, false);
  assert.equal(results[1]?.success, true);
  assert.equal(plan.attacks.length, 2);
  assert.equal(plan.attacks[1]?.type, "authorization");
  assert.equal(context.executionResults.length, 2);
  assert.equal(
    context.vulnerabilities.some((vulnerability) => vulnerability.id === "active-finding-authz"),
    true
  );
});

test("ExecutionPhase throws a clear error when the active tester requires an actor", async () => {
  const plan = createPlan([createAttack()]);
  const context = createContext(plan);

  const activeTester = {
    async runAuthorizedSecurityTest(
      _actor: AccessContext,
      _input: { url: string }
    ) {
      return createAuthorizedSecurityTestReport("authentication");
    }
  };

  const decisionEngine = {
    async evaluateResult() {
      return {
        success: true,
        insights: ["Confirmed evidence."],
        nextStep: "Continue.",
        canEscalate: false,
        confidence: 0.8
      };
    },
    async decideNextAction() {
      return createDecision("Continue with next planned attack");
    },
    async suggestAlternative() {
      return createAttack();
    }
  };

  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const phase = new ExecutionPhase(
    activeTester as never,
    decisionEngine as never,
    llm,
    createLogger() as never
  );

  await assert.rejects(
    phase.execute(plan, context),
    (error: unknown) =>
      error instanceof AppError &&
      error.message.includes("requires an AccessContext"),
    "Expected missing-actor configuration to raise an AppError"
  );
});
