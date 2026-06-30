import assert from "node:assert/strict";
import test from "node:test";

import type { LLMService } from "../src/services/llm/llm.service";
import { ReportGenerator } from "../src/services/penetration-testing/report-generator.service";
import type {
  AttackChain,
  AttackPlan,
  Evidence,
  PenetrationTestContext,
  Vulnerability
} from "../src/services/penetration-testing/penetration-test-orchestrator.service";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function createVulnerability(
  overrides: Partial<Vulnerability> = {}
): Vulnerability {
  return {
    id: "vuln-1",
    type: "authentication",
    severity: "high",
    location: "https://example.com/admin",
    description: "Anonymous GET requests reached privileged content.",
    evidence: "endpoint=https://example.com/admin",
    remediation: "Require authentication on the privileged route.",
    confidence: 0.9,
    exploitable: true,
    ...overrides
  };
}

function createPlan(): AttackPlan {
  return {
    id: "plan-1",
    name: "Read-only access-control plan",
    description: "Validate authentication and authorization boundaries.",
    attacks: [
      {
        id: "attack-auth",
        name: "Validate administrative authentication boundary",
        type: "authentication",
        target: "https://example.com/admin",
        payload: "Compare anonymous and authenticated read-only responses.",
        expectedOutcome: "Confirm whether administrative content is protected.",
        status: "success",
        result: "The guarded run confirmed missing authentication pressure."
      }
    ],
    priority: "high",
    estimatedSuccess: 0.82
  };
}

function createChain(): AttackChain {
  return {
    id: "chain-1",
    name: "Privilege boundary failure chain",
    impact: "critical",
    effort: "easy",
    businessImpact:
      "Discovery of privileged routes plus failed authentication and authorization checks creates a coherent unauthorized-access path.",
    steps: [
      {
        step: 1,
        vulnerability: "passive-admin",
        action: "Locate privileged-looking application routes.",
        result: "Privileged-looking admin routes are visible anonymously.",
        evidence: "/admin",
        nextStep: "Validate whether the routes challenge anonymous access."
      },
      {
        step: 2,
        vulnerability: "vuln-1",
        action: "Run read-only authentication validation against the exposed route.",
        result: "Anonymous GET requests reached privileged content.",
        evidence: "endpoint=https://example.com/admin",
        nextStep: "Report the privilege-boundary failure and remediation path."
      }
    ]
  };
}

function createEvidence(): Evidence[] {
  return [
    {
      id: "evidence-1",
      type: "recon",
      description: "Passive reconnaissance completed.",
      data: {
        headline: "Passive review found exposed administrative surface."
      },
      timestamp: new Date("2026-06-24T08:01:00.000Z")
    },
    {
      id: "evidence-2",
      type: "execution",
      description: "Authentication validation completed.",
      data: {
        success: true
      },
      timestamp: new Date("2026-06-24T08:06:00.000Z")
    }
  ];
}

function createContext(): PenetrationTestContext {
  return {
    target: "https://example.com",
    verificationId: "verification-1",
    startTime: new Date("2026-06-24T08:00:00.000Z"),
    reconData: {
      summary: {
        headline: "Passive review found exposed administrative surface.",
        riskLevel: "high"
      },
      priority: "high"
    },
    vulnerabilities: [
      createVulnerability({
        id: "passive-admin",
        type: "authentication",
        severity: "high",
        location: "https://example.com/admin",
        description: "Privileged-looking admin routes are visible anonymously.",
        evidence: "/admin",
        confidence: 0.9,
        exploitable: false
      }),
      createVulnerability(),
      createVulnerability({
        id: "vuln-2",
        type: "authorization",
        severity: "high",
        description: "Lower-trust and higher-trust responses were equivalent.",
        evidence: "endpoint=https://example.com/admin",
        remediation: "Enforce role-based authorization checks on privileged routes.",
        confidence: 0.89,
        exploitable: true
      }),
      createVulnerability({
        id: "vuln-3",
        type: "api_security",
        severity: "medium",
        location: "https://example.com/graphql",
        description: "Sensitive API surface appears publicly discoverable.",
        evidence: "endpoint=https://example.com/graphql",
        remediation: "Restrict API explorer tooling to authenticated administrators.",
        confidence: 0.72,
        exploitable: true
      })
    ],
    attackPlan: createPlan(),
    executionResults: [
      {
        attackId: "attack-auth",
        attackName: "Validate administrative authentication boundary",
        success: true,
        status: "success",
        message: "The guarded run confirmed missing authentication pressure.",
        evidence: "endpoint=https://example.com/admin",
        vulnerability: createVulnerability(),
        timestamp: new Date("2026-06-24T08:06:00.000Z"),
        rawData: {
          runId: "authorized-run-authentication"
        }
      }
    ],
    attackChains: [createChain()],
    evidence: createEvidence(),
    decisions: [
      {
        id: "decision-1",
        action: "Prioritize related authorization checks",
        reason: "The authentication signal raises the value of adjacent trust-boundary validation.",
        confidence: 0.82,
        alternative: "Continue with next planned attack",
        timestamp: new Date("2026-06-24T08:05:00.000Z")
      }
    ],
    currentPhase: "reporting",
    isComplete: false
  };
}

test("ReportGenerator produces an AI-backed report when a model is available", async () => {
  const llmCalls: string[] = [];
  const llm = {
    async listProviders() {
      return [
        {
          id: "qwen",
          models: ["qwen2.5-coder"]
        }
      ];
    },
    async createStructuredOutput(
      _provider: string,
      request: { messages: Array<{ role: string; content: string }> }
    ) {
      const system = request.messages[0]?.content ?? "";
      llmCalls.push(system);
      if (system.includes("executive summary")) {
        return {
          executiveSummary:
            "The authorized read-only test confirmed a critical access-control chain around the administrative surface and should be remediated urgently."
        };
      }

      if (system.includes("attacker-perspective narrative")) {
        return {
          narrative:
            "The engagement moved from public route discovery into guarded read-only validation that confirmed missing authentication pressure and adjacent authorization weakness on the administrative surface."
        };
      }

      return {
        recommendations: [
          "Require authentication before privileged routes render any protected content.",
          "Enforce role-based authorization checks consistently on privileged routes.",
          "Restrict API explorer tooling to authenticated administrators."
        ]
      };
    }
  } as unknown as LLMService;

  const generator = new ReportGenerator(llm, createLogger() as never, {
    passivePageLimit: 4,
    requestBudget: 18,
    authProfileNames: ["low", "high"],
    declaredAuthEndpoints: 1,
    auditTrailEntries: 6,
    guardrails: [
      "Execution remained inside an authorized read-only boundary.",
      "Validation stayed on the same origin as the approved target."
    ],
    manualFormValidation: {
      rateLimitPerMinute: 5,
      credentialLabels: ["qa-admin"],
      notes: "Manual POST validation only."
    },
    now: () => new Date("2026-06-24T08:10:00.000Z")
  });

  const report = await generator.generateReport(createContext());

  assert.equal(llmCalls.length, 3);
  assert.equal(report.target, "https://example.com");
  assert.equal(report.executiveSummary.includes("critical access-control chain"), true);
  assert.equal(report.narrative.includes("public route discovery"), true);
  assert.equal(report.recommendations.length >= 3, true);
  assert.equal(report.recommendations.includes("Restrict API explorer tooling to authenticated administrators."), true);
  assert.equal(report.impact.includes("critical privilege"), true);
  assert.equal(report.attackChains.length, 1);
  assert.equal(report.engagement.targetOrigin, "https://example.com");
  assert.equal(report.engagement.requestBudget, 18);
  assert.equal(report.engagement.declaredAuthEndpoints, 1);
  assert.equal(report.engagement.manualFormValidation?.rateLimitPerMinute, 5);
  assert.equal(report.assurance.readOnlyOnly, true);
  assert.equal(report.assurance.auditTrailEntries, 6);
  assert.equal(report.remediationPlan.workItems.length >= 2, true);
  assert.equal(
    report.remediationPlan.workItems.some(
      (item) => item.title === "Restore authentication gates on privileged surfaces"
    ),
    true
  );
  assert.equal(report.vulnerabilities.length, 4);
  assert.equal(report.evidence.length, 2);
  assert.equal(typeof report.id, "string");
  assert.equal(report.duration, 10 * 60 * 1000);
});

test("ReportGenerator falls back to deterministic content when AI is unavailable", async () => {
  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const generator = new ReportGenerator(llm, createLogger() as never, {
    now: () => new Date("2026-06-24T08:10:00.000Z")
  });

  const report = await generator.generateReport(createContext());

  assert.equal(report.executiveSummary.includes("authorized read-only penetration test"), true);
  assert.equal(report.narrative.includes("authorized read-only boundary"), true);
  assert.equal(report.recommendations.length >= 3, true);
  assert.equal(
    report.recommendations.some((recommendation) =>
      recommendation.includes("Require authentication")
    ),
    true
  );
  assert.equal(report.impact.includes("critical privilege"), true);
  assert.equal(report.engagement.guardrails.length >= 3, true);
  assert.equal(report.assurance.successfulValidations, 1);
  assert.equal(report.remediationPlan.workItems.length >= 2, true);
  assert.equal(report.rawData.stats.chainCount, 1);
  assert.equal(report.rawData.stats.confirmedFindings, 1);
});
