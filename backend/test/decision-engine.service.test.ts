import assert from "node:assert/strict";
import test from "node:test";

import type { LLMService } from "../src/services/llm/llm.service";
import { DecisionEngine } from "../src/services/penetration-testing/decision-engine.service";
import type {
  Attack,
  AttackResult,
  PenetrationTestContext,
  Vulnerability
} from "../src/services/penetration-testing/penetration-test-orchestrator.service";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {}
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
    description: "Administrative surface appears reachable anonymously.",
    evidence: "/admin",
    remediation: "Require authentication.",
    confidence: 0.9,
    exploitable: true,
    ...overrides
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
    status: "failed",
    ...overrides
  };
}

function createContext(
  overrides: Partial<PenetrationTestContext> = {}
): PenetrationTestContext {
  const authenticationAttack = createAttack({
    id: "attack-auth",
    status: "pending"
  });
  const authorizationAttack = createAttack({
    id: "attack-authz",
    name: "Compare low- and high-privilege access to admin surface",
    type: "authorization",
    target: "https://example.com/admin",
    payload: "Compare lower- and higher-trust read-only responses.",
    expectedOutcome: "Determine whether authorization boundaries differ.",
    status: "pending"
  });

  return {
    target: "https://example.com",
    verificationId: "verification-1",
    startTime: new Date("2026-06-24T09:00:00.000Z"),
    reconData: {
      summary: {
        headline: "Administrative and API surface is exposed.",
        riskLevel: "high"
      },
      priority: "high"
    },
    vulnerabilities: [
      createVulnerability(),
      createVulnerability({
        id: "vuln-2",
        type: "api_security",
        severity: "medium",
        location: "https://example.com/graphql",
        description: "GraphQL route appears publicly discoverable.",
        evidence: "/graphql",
        remediation: "Restrict API explorer tooling.",
        confidence: 0.7,
        exploitable: false
      })
    ],
    attackPlan: {
      id: "plan-1",
      name: "Read-only validation plan",
      description: "Validate authentication and authorization boundaries.",
      attacks: [authenticationAttack, authorizationAttack],
      priority: "high",
      estimatedSuccess: 0.81
    },
    executionResults: [],
    attackChains: [],
    evidence: [],
    decisions: [],
    currentPhase: "execution",
    isComplete: false,
    ...overrides
  };
}

test("DecisionEngine chooses the AI-selected next action when it is available", async () => {
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
        action: "Continue with authorization validation",
        reason:
          "The authentication signal increases the value of verifying privilege-boundary behavior next.",
        confidence: 0.91,
        alternative: "Report findings now"
      };
    }
  } as unknown as LLMService;

  const engine = new DecisionEngine(llm, createLogger() as never);
  const decision = await engine.decideNextAction(createContext(), [
    "Continue with authorization validation",
    "Report findings now",
    "Stop the run"
  ]);

  assert.equal(decision.action, "Continue with authorization validation");
  assert.equal(
    decision.reason,
    "The authentication signal increases the value of verifying privilege-boundary behavior next."
  );
  assert.equal(decision.confidence, 0.91);
  assert.equal(decision.alternative, "Report findings now");
  assert.equal(typeof decision.id, "string");
  assert.equal(decision.timestamp instanceof Date, true);
});

test("DecisionEngine evaluates results heuristically when AI is unavailable", async () => {
  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const engine = new DecisionEngine(llm, createLogger() as never);
  const result: AttackResult = {
    success: true,
    message: "Anonymous requests reached privileged content.",
    evidence: "endpoint=https://example.com/admin",
    vulnerability: createVulnerability(),
    timestamp: new Date("2026-06-24T09:10:00.000Z")
  };

  const evaluation = await engine.evaluateResult(
    createAttack({
      status: "success"
    }),
    result
  );

  assert.equal(evaluation.success, true);
  assert.equal(evaluation.canEscalate, true);
  assert.equal(
    evaluation.nextStep.includes("authorization boundary checks"),
    true
  );
  assert.equal(evaluation.insights.length > 0, true);
  assert.equal(evaluation.confidence >= 0.6, true);
});

test("DecisionEngine sanitizes AI-generated alternative attacks to stay safe and same-origin", async () => {
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
        name: "Alternative API validation",
        type: "api_security",
        target: "https://attacker.example.net/graphql",
        payload: "DELETE /admin to force an error",
        expectedOutcome: "Check whether GraphQL metadata is reachable publicly."
      };
    }
  } as unknown as LLMService;

  const engine = new DecisionEngine(llm, createLogger() as never);
  const alternative = await engine.suggestAlternative(
    createAttack({
      type: "authentication",
      target: "https://example.com/admin",
      payload: "Compare anonymous and authenticated read-only responses."
    }),
    createContext()
  );

  assert.equal(alternative.type, "api_security");
  assert.equal(alternative.target, "https://example.com/admin");
  assert.equal(
    alternative.payload,
    "Inspect public read-only API metadata and response shaping for sensitive routes."
  );
  assert.equal(alternative.status, "pending");
  assert.equal(typeof alternative.id, "string");
});
