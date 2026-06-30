import test from "node:test";
import assert from "node:assert/strict";

import { AuthorizedSecurityTestRunRepository } from "../src/database/repositories/authorized-security-test-run.repository";

function createLegacyRow() {
  const timestamp = new Date("2026-06-26T00:00:00.000Z");

  return {
    id: "run-1",
    workspace_id: "workspace-1",
    organization_id: "org-1",
    verification_id: "verification-1",
    requested_by_user_id: "user-1",
    target_url: "https://example.com",
    hostname: "example.com",
    status: "completed",
    requested_modules: ["authentication"],
    guardrails: ["Read-only probes only"],
    redacted_auth_profiles: [],
    baseline: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com/login",
      hostname: "example.com",
      pagesScanned: 4,
      maxPages: 10,
      securityScore: 82,
      grade: "B",
      passiveWarnings: ["Login form detected"]
    },
    plan: [],
    summary: {
      riskLevel: "medium",
      headline: "Legacy run payload",
      planSource: "deterministic",
      requestBudget: 12,
      requestsSent: 8,
      modulesExecuted: ["authentication"],
      findingCounts: {
        high: 1
      },
      campaignStory: {
        headline: "Campaign",
        narrative: "Narrative"
      }
    },
    findings: [],
    attack_paths: [],
    ai_analysis: {
      status: "ready"
    },
    warnings: [],
    started_at: timestamp,
    completed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp
  };
}

test("AuthorizedSecurityTestRunRepository normalizes legacy nested report fields", async () => {
  const repository = new AuthorizedSecurityTestRunRepository({
    query: async () => ({
      rowCount: 1,
      rows: [createLegacyRow()]
    })
  } as never);

  const run = await repository.findById("run-1");

  assert.ok(run);
  assert.deepEqual(run.baseline.declaredAuthEndpoints, []);
  assert.deepEqual(run.summary.recommendedActions, []);
  assert.equal(run.summary.findingCounts.info, 0);
  assert.equal(run.summary.findingCounts.low, 0);
  assert.equal(run.summary.findingCounts.medium, 0);
  assert.equal(run.summary.findingCounts.high, 1);
  assert.deepEqual(run.summary.campaignStory?.chainHighlights, []);
  assert.deepEqual(run.summary.campaignStory?.sections, []);
  assert.deepEqual(run.aiAnalysis.predictions, []);
  assert.deepEqual(run.aiAnalysis.nextSteps, []);
});
