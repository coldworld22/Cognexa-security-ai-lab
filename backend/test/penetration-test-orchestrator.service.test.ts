import assert from "node:assert/strict";
import test from "node:test";

import { AccessContext } from "../src/authorization/authorization.types";
import {
  PenetrationTestOrchestrator,
  PenetrationTestReport,
  PenetrationTestStreamEvent
} from "../src/services/penetration-testing/penetration-test-orchestrator.service";
import { SecurityReviewResult } from "../src/services/security-review/security-review.service";
import { AuthorizedSecurityTestReport } from "../src/services/authorized-testing/authorized-security-testing.types";

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

function createSecurityReviewResult(): SecurityReviewResult {
  return {
    reviewedAt: "2026-06-24T08:00:00.000Z",
    target: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      hostname: "example.com",
      pagesScanned: 3,
      maxPages: 4
    },
    posture: {
      securityScore: 61,
      grade: "C",
      analysisMode: "http",
      browserEngine: null
    },
    summary: {
      riskLevel: "medium",
      headline: "Passive review found exposed privileged application surface.",
      strengths: ["HTTPS is enabled."],
      topRisks: ["Privileged routes appear reachable anonymously."],
      recommendedActions: ["Require authentication before privileged pages render."],
      exposedAttackPaths: 1,
      constrainedAttackPaths: 0,
      roadmap: {
        immediate: ["Protect admin routes with middleware."],
        next: ["Reduce public application surface."],
        hardening: ["Tighten browser security headers."]
      }
    },
    attackPaths: [
      {
        id: "path-1",
        title: "Anonymous user discovers privileged route structure",
        status: "exposed",
        attackerGoal: "Reach administrative functionality",
        attackerEffort: "low",
        narrative:
          "The public route structure suggests that privileged content is easy to discover anonymously.",
        blockers: [],
        example: "Visit /admin and observe the response path.",
        nextAction: "Run guarded authentication and authorization validation.",
        supportingCheckIds: ["forms-1"]
      }
    ],
    counts: {
      pass: 3,
      warn: 1,
      fail: 1
    },
    warnings: ["Weak browser hardening was observed."],
    checks: [
      {
        id: "forms-1",
        category: "forms",
        status: "fail",
        name: "Protected routes require authentication",
        expectation: "Privileged pages should challenge anonymous access.",
        observed: "Protected-looking routes were visible in the crawl window.",
        evidence: ["/admin", "/login"]
      }
    ],
    findings: [
      {
        id: "passive-finding-1",
        severity: "high",
        category: "forms",
        title: "Administrative surface appears reachable from the public origin",
        summary: "The passive review suggests a public route structure around login and admin pages.",
        impact: "Attackers can focus on privileged flows quickly.",
        attackerEffort: "low",
        confidence: "high",
        priority: "immediate",
        attackerView: "Administrative pages are visible without prior authentication context.",
        attackerPrerequisites: ["A normal browser session."],
        remediation: "Require authentication before privileged content is rendered.",
        fixExample: "Move admin pages behind middleware that verifies session state.",
        safeVerification: "Reload the same route anonymously and confirm it redirects to sign-in.",
        pageUrl: "https://example.com/admin",
        evidence: ["/admin", "/login"],
        checkIds: ["forms-1"]
      }
    ],
    aiAnalysis: {
      status: "ready",
      provider: "qwen",
      model: "qwen2.5-coder",
      headline: "The public attack surface should be tightened first.",
      analystPerspective: "The strongest signal is route exposure around privileged pages.",
      decisiveVerdict: "Start with authentication and authorization boundaries.",
      decisions: [],
      retestFocus: ["Admin routes"],
      constraints: ["Passive only"]
    }
  };
}

function createAuthorizedSecurityTestReport(
  module: "authentication" | "authorization"
): AuthorizedSecurityTestReport {
  const finding =
    module === "authentication"
      ? {
          id: "active-finding-auth",
          category: "authentication" as const,
          severity: "high" as const,
          title: "A protected-looking route appears reachable without authentication",
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
      passiveWarnings: ["Weak cookies"]
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
    ]
  };
}

test("PenetrationTestOrchestrator coordinates reconnaissance, planning, execution, persistence, and streaming", async () => {
  const agentStore = new Map<string, Record<string, unknown>>();
  const taskStore = new Map<string, Record<string, unknown>>();
  const passiveReview = createSecurityReviewResult();
  const authenticationReport = createAuthorizedSecurityTestReport("authentication");
  const authorizationReport = createAuthorizedSecurityTestReport("authorization");
  const events: PenetrationTestStreamEvent[] = [];
  let llmCall = 0;

  const orchestrator = new PenetrationTestOrchestrator(
    "example.com",
    "verification-1",
    "run-1",
    {
      actor: createActor(),
      agents: {
        create: async (input: Record<string, unknown>) => {
          const agent = {
            id: `agent-${agentStore.size + 1}`,
            createdAt: "2026-06-24T08:00:00.000Z",
            updatedAt: "2026-06-24T08:00:00.000Z",
            ...input
          };
          agentStore.set(agent.id, agent);
          return agent as never;
        }
      } as never,
      tasks: {
        create: async (input: Record<string, unknown>) => {
          const task = {
            id: `task-${taskStore.size + 1}`,
            createdAt: "2026-06-24T08:00:00.000Z",
            updatedAt: "2026-06-24T08:00:00.000Z",
            ...input
          };
          taskStore.set(task.id, task);
          return task as never;
        },
        updateState: async (id: string, input: Record<string, unknown>) => {
          const current = taskStore.get(id)!;
          taskStore.set(id, {
            ...current,
            ...input,
            updatedAt: "2026-06-24T08:06:00.000Z"
          });
        }
      } as never,
      llm: {
        createStructuredOutput: async () => {
          llmCall += 1;
          if (llmCall === 1) {
            return {
              name: "Read-only access-control validation plan",
              description:
                "Prioritize authentication and authorization checks because reconnaissance exposed privileged routes.",
              priority: "high",
              estimatedSuccess: 0.86,
              attacks: [
                {
                  name: "Validate authentication boundaries",
                  type: "authentication",
                  target: "https://example.com/admin",
                  payload:
                    "Anonymous and low-trust GET/HEAD requests against privileged-looking routes.",
                  expectedOutcome:
                    "Protected routes should reject or redirect unauthenticated requests."
                },
                {
                  name: "Compare authorization boundaries",
                  type: "authorization",
                  target: "https://example.com/admin",
                  payload: "Read-only response comparison across low- and high-trust profiles.",
                  expectedOutcome:
                    "Lower-trust responses should lose access to privileged content."
                }
              ]
            };
          }

          if (llmCall === 2) {
            return {
              action: "Advance chain and prioritize related authorization checks",
              reason:
                "The authentication weakness justifies moving immediately to authorization validation.",
              confidence: 0.88,
              alternative: "Continue with the original order."
            };
          }

          if (llmCall === 3) {
            return {
              action: "Report only",
              reason:
                "The access-control chain is already established and additional attacks add little value.",
              confidence: 0.83,
              alternative: "Continue lower-priority read-only checks."
            };
          }

          return {
            executiveSummary:
              "The orchestrated run combined passive route discovery with guarded active validation and confirmed access-control weaknesses without leaving read-only scope.",
            narrative:
              "Reconnaissance exposed a privileged route structure, the plan focused on authentication and authorization, and execution confirmed a coherent privilege-boundary failure chain.",
            impact:
              "An attacker can reach privileged application surface faster and may obtain unauthorized access if the same controls remain weak in production.",
            recommendations: [
              "Require authentication before privileged content is rendered.",
              "Enforce role checks on privileged routes."
            ]
          };
        }
      } as never,
      passiveScanner: {
        runReview: async () => passiveReview
      } as never,
      activeTester: {
        runAuthorizedSecurityTest: async (
          _actor: AccessContext,
          input: Record<string, unknown>
        ) => {
          const module = (input.modules as string[])[0];
          return module === "authorization" ? authorizationReport : authenticationReport;
        }
      } as never,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
        fatal: () => undefined,
        trace: () => undefined,
        silent: () => undefined,
        child: () => {
          throw new Error("Not implemented");
        },
        level: "info"
      } as never,
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
      ],
      maxPages: 4,
      maxRequests: 18,
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      now: () => new Date("2026-06-24T08:00:00.000Z")
    }
  );

  orchestrator.getEventEmitter().on("update", (event: PenetrationTestStreamEvent) => {
    events.push(event);
  });

  const report = await orchestrator.run();
  const persisted = Array.from(taskStore.values())[0] as {
    status: string;
    metadata: {
      penetrationTest: {
        runId: string;
        report?: PenetrationTestReport;
      };
    };
  };

  assert.equal(report.id, "run-1");
  assert.equal(report.target, "https://example.com/");
  assert.equal(report.attackChains.length, 1);
  assert.equal(report.vulnerabilities.some((vulnerability) => vulnerability.type === "authentication"), true);
  assert.equal(report.vulnerabilities.some((vulnerability) => vulnerability.type === "authorization"), true);
  assert.equal(report.executiveSummary.includes("read-only"), true);
  assert.equal(report.recommendations.length >= 2, true);
  assert.equal(persisted.status, "completed");
  assert.equal(persisted.metadata.penetrationTest.runId, "run-1");
  assert.equal(persisted.metadata.penetrationTest.report?.id, report.id);
  assert.equal(events.some((event) => event.type === "phase"), true);
  assert.equal(events.some((event) => event.type === "decision"), true);
  assert.equal(events.some((event) => event.type === "report"), true);
  assert.equal(events.some((event) => event.type === "complete"), true);
});
