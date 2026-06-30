import assert from "node:assert/strict";
import test from "node:test";

import { RemediationEngine } from "../src/services/penetration-testing/remediation-engine.service";
import type {
  AttackChain,
  Vulnerability
} from "../src/services/penetration-testing/penetration-test-orchestrator.service";

function createVulnerability(
  overrides: Partial<Vulnerability> = {}
): Vulnerability {
  return {
    id: "vuln-auth",
    type: "authentication",
    severity: "high",
    location: "https://example.com/admin",
    description: "Anonymous requests reached privileged content.",
    evidence: "endpoint=/admin",
    remediation: "Require authentication on privileged routes.",
    confidence: 0.92,
    exploitable: true,
    ...overrides
  };
}

function createChain(): AttackChain {
  return {
    id: "chain-1",
    name: "Privilege boundary failure chain",
    impact: "critical",
    effort: "easy",
    businessImpact: "A chained trust-boundary failure can expose privileged content.",
    steps: [
      {
        step: 1,
        vulnerability: "vuln-auth",
        action: "Validate authentication boundary",
        result: "Anonymous requests reached privileged content.",
        evidence: "endpoint=/admin",
        nextStep: "Validate adjacent authorization handling."
      }
    ]
  };
}

test("RemediationEngine groups findings into prioritized work items", () => {
  const engine = new RemediationEngine();
  const plan = engine.buildPlan(
    [
      createVulnerability(),
      createVulnerability({
        id: "vuln-auth-2",
        type: "authentication",
        severity: "medium",
        description: "Login pressure was inconsistent on an adjacent route.",
        location: "https://example.com/support"
      }),
      createVulnerability({
        id: "vuln-api",
        type: "api_security",
        severity: "medium",
        location: "https://example.com/graphql",
        description: "Sensitive API explorer tooling was publicly reachable.",
        remediation: "Restrict API explorer tooling to administrators."
      })
    ],
    [createChain()]
  );

  assert.equal(plan.workItems.length, 2);
  assert.equal(plan.workItems[0]?.title, "Restore authentication gates on privileged surfaces");
  assert.equal(plan.workItems[0]?.priority, "immediate");
  assert.equal(plan.workItems[0]?.owner, "identity");
  assert.deepEqual(plan.workItems[0]?.sourceVulnerabilityIds, [
    "vuln-auth",
    "vuln-auth-2"
  ]);
  assert.equal(plan.workItems[1]?.owner, "platform");
  assert.equal(plan.quickWins.length > 0, true);
  assert.equal(plan.strategicFixes.length > 0, true);
});
