import assert from "node:assert/strict";
import test from "node:test";

import type { LLMService } from "../src/services/llm/llm.service";
import { ChainBuilder } from "../src/services/penetration-testing/chain-builder.service";
import type { Vulnerability } from "../src/services/penetration-testing/penetration-test-orchestrator.service";

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

test("ChainBuilder returns validated AI-generated chains with calculated impact and effort", async () => {
  const vulnerabilities: Vulnerability[] = [
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
    createVulnerability({
      id: "auth-confirmed",
      type: "authentication",
      severity: "high",
      description: "Anonymous GET requests reached privileged content.",
      evidence: "endpoint=https://example.com/admin",
      confidence: 0.91,
      exploitable: true
    }),
    createVulnerability({
      id: "authz-confirmed",
      type: "authorization",
      severity: "high",
      description: "Lower-trust and higher-trust responses were equivalent.",
      evidence: "endpoint=https://example.com/admin",
      confidence: 0.89,
      exploitable: true
    })
  ];

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
            businessImpact:
              "Discovery of privileged routes, missing authentication pressure, and missing authorization separation create a coherent unauthorized-access path.",
            steps: [
              {
                vulnerabilityId: "passive-admin",
                action: "Use passive reconnaissance to locate privileged-looking application routes.",
                result: "Privileged-looking admin routes are visible anonymously.",
                evidence: "/admin",
                nextStep: "Validate whether the routes challenge anonymous access."
              },
              {
                vulnerabilityId: "auth-confirmed",
                action: "Run read-only authentication validation against the exposed route.",
                result: "Anonymous GET requests reached privileged content.",
                evidence: "endpoint=https://example.com/admin",
                nextStep: "Compare lower-trust and higher-trust responses."
              },
              {
                vulnerabilityId: "authz-confirmed",
                action: "Run differential authorization checks across approved profiles.",
                result: "Lower-trust and higher-trust responses were equivalent.",
                evidence: "endpoint=https://example.com/admin",
                nextStep: "Report the privilege-boundary failure and remediation path."
              }
            ]
          }
        ]
      };
    }
  } as unknown as LLMService;

  const builder = new ChainBuilder(llm, createLogger() as never);
  const chains = await builder.buildChains(vulnerabilities);

  assert.equal(chains.length, 1);
  assert.equal(chains[0]?.name, "Privilege boundary failure chain");
  assert.equal(chains[0]?.impact, "critical");
  assert.equal(chains[0]?.effort, "easy");
  assert.deepEqual(
    chains[0]?.steps.map((step) => step.vulnerability),
    ["passive-admin", "auth-confirmed", "authz-confirmed"]
  );
});

test("ChainBuilder falls back to heuristic chains when AI is unavailable or invalid", async () => {
  const vulnerabilities: Vulnerability[] = [
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
    createVulnerability({
      id: "auth-confirmed",
      type: "authentication",
      severity: "high",
      description: "Anonymous GET requests reached privileged content.",
      evidence: "endpoint=https://example.com/admin",
      confidence: 0.91,
      exploitable: true
    }),
    createVulnerability({
      id: "authz-confirmed",
      type: "authorization",
      severity: "high",
      description: "Lower-trust and higher-trust responses were equivalent.",
      evidence: "endpoint=https://example.com/admin",
      confidence: 0.89,
      exploitable: true
    })
  ];

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
            name: "Invalid chain",
            businessImpact: "This chain references vulnerabilities that do not exist.",
            steps: [
              {
                vulnerabilityId: "missing-1",
                action: "Unknown step",
                result: "Unknown result",
                evidence: "Unknown evidence",
                nextStep: "Unknown next step"
              },
              {
                vulnerabilityId: "missing-2",
                action: "Unknown step",
                result: "Unknown result",
                evidence: "Unknown evidence",
                nextStep: "Unknown next step"
              }
            ]
          }
        ]
      };
    }
  } as unknown as LLMService;

  const builder = new ChainBuilder(llm, createLogger() as never);
  const chains = await builder.buildChains(vulnerabilities);

  assert.equal(chains.length, 1);
  assert.equal(chains[0]?.name, "Privilege boundary failure chain");
  assert.equal(chains[0]?.impact, "critical");
  assert.equal(chains[0]?.effort, "easy");
  assert.equal(chains[0]?.steps.length, 3);
});

test("ChainBuilder returns no chains when there are not enough vulnerabilities", async () => {
  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const builder = new ChainBuilder(llm, createLogger() as never);
  const chains = await builder.buildChains([
    createVulnerability({
      id: "single-vuln"
    })
  ]);

  assert.deepEqual(chains, []);
});
