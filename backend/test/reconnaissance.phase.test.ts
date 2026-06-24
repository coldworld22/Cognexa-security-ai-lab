import assert from "node:assert/strict";
import test from "node:test";

import type { AccessContext } from "../src/authorization/authorization.types";
import { AppError } from "../src/utils/app-error";
import type { LLMService } from "../src/services/llm/llm.service";
import {
  ReconnaissancePhase
} from "../src/services/penetration-testing/phases/reconnaissance.phase";
import type {
  SecurityReviewResult,
  SecurityReviewService as SecurityReviewLab
} from "../src/services/security-review/security-review.service";

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

function createScanResult(): SecurityReviewResult {
  return {
    reviewedAt: "2026-06-24T10:00:00.000Z",
    target: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      hostname: "example.com",
      pagesScanned: 3,
      maxPages: 4
    },
    posture: {
      securityScore: 49,
      grade: "D",
      analysisMode: "browser",
      browserEngine: "chromium"
    },
    summary: {
      riskLevel: "high",
      headline: "Passive review found exposed administrative and API discovery surface.",
      strengths: ["HTTPS is enabled."],
      topRisks: [
        "Swagger documentation is reachable from the public origin.",
        "Administrative routes appear discoverable anonymously."
      ],
      recommendedActions: [
        "Require authentication before administrative or API explorer content renders."
      ],
      exposedAttackPaths: 1,
      constrainedAttackPaths: 0,
      roadmap: {
        immediate: ["Protect administrative routes."],
        next: ["Reduce public API metadata exposure."],
        hardening: ["Tighten response header hardening."]
      }
    },
    attackPaths: [
      {
        id: "path-1",
        title: "Anonymous discovery of admin and GraphQL surfaces",
        status: "exposed",
        attackerGoal: "Reach privileged or introspective functionality",
        attackerEffort: "low",
        narrative:
          "The passive review revealed public route hints around /admin, /graphql, and /swagger.",
        blockers: [],
        example: "Visit /admin or /graphql from a normal browser session.",
        nextAction: "Validate that /admin and /graphql require authentication.",
        supportingCheckIds: ["headers-1", "forms-1"]
      }
    ],
    counts: {
      pass: 2,
      warn: 2,
      fail: 1
    },
    warnings: ["The crawler observed publicly reachable API discovery hints."],
    checks: [
      {
        id: "headers-1",
        category: "headers",
        status: "warn",
        name: "Response headers disclose framework and API tooling",
        expectation: "Public responses should minimize framework and tooling disclosure.",
        observed: "The response advertises Express and references public Swagger routes.",
        evidence: ["x-powered-by=Express", "/swagger"]
      },
      {
        id: "forms-1",
        category: "forms",
        status: "fail",
        name: "Administrative routes are not obscured from anonymous discovery",
        expectation: "Privileged routes should not be discoverable without authentication.",
        observed: "Anonymous navigation hints include /admin and /login.",
        evidence: ["/admin", "/login"]
      }
    ],
    findings: [
      {
        id: "finding-1",
        severity: "high",
        category: "forms",
        title: "Administrative route structure is visible from the public origin",
        summary: "The passive review exposed route hints around /admin and /login.",
        impact: "Attackers can focus quickly on privileged workflows.",
        attackerEffort: "low",
        confidence: "high",
        priority: "immediate",
        attackerView: "Admin navigation hints are visible before authentication.",
        attackerPrerequisites: ["A normal browser session."],
        remediation: "Gate administrative content behind authentication middleware.",
        fixExample: "Redirect anonymous requests for /admin to sign-in.",
        safeVerification: "Reload /admin anonymously after the fix.",
        pageUrl: "https://example.com/admin",
        evidence: ["/admin", "/login"],
        checkIds: ["forms-1"]
      },
      {
        id: "finding-2",
        severity: "medium",
        category: "exposure",
        title: "Swagger and GraphQL discovery surface is exposed publicly",
        summary:
          "Public documentation and explorer hints reference /swagger and /graphql.",
        impact: "Attackers can enumerate the API surface faster.",
        attackerEffort: "low",
        confidence: "medium",
        priority: "next",
        attackerView: "Public tooling lowers the cost of route discovery.",
        attackerPrerequisites: ["A normal browser session."],
        remediation: "Restrict API explorer tooling to authenticated administrators.",
        fixExample: "Serve Swagger only behind access controls.",
        safeVerification: "Check that /swagger no longer renders anonymously.",
        pageUrl: "https://example.com/swagger",
        evidence: ["endpoint=https://example.com/graphql", "/swagger"],
        checkIds: ["headers-1"]
      }
    ],
    aiAnalysis: {
      status: "ready",
      provider: "qwen",
      model: "qwen2.5-coder",
      headline: "Administrative and API discovery surface should be reduced first.",
      analystPerspective: "The strongest signal is public route discovery around admin and API tooling.",
      decisiveVerdict: "Prioritize authentication boundaries and API explorer restrictions.",
      decisions: [
        {
          title: "Protect administrative surface",
          priority: "immediate",
          rationale: "Anonymous discovery of privileged routes reduces attacker effort.",
          safeAction: "Require authentication before admin pages render."
        }
      ],
      retestFocus: ["/admin", "/graphql"],
      constraints: ["Passive-only evidence."]
    }
  };
}

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

test("ReconnaissancePhase combines passive scan results with AI analysis", async () => {
  const actor = createActor();
  const scanResult = createScanResult();
  const scannerCalls: Array<{ actor: AccessContext; input: { url: string; maxPages?: number } }> =
    [];

  const scanner = {
    async runReview(
      receivedActor: AccessContext,
      input: { url: string; maxPages?: number }
    ) {
      scannerCalls.push({
        actor: receivedActor,
        input
      });
      return scanResult;
    }
  } as unknown as SecurityReviewLab;

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
        headline: "Administrative and API surfaces are the highest-value follow-up targets.",
        reasoning:
          "The scan shows anonymous route discovery, public API tooling, and a likely GraphQL surface.",
        technologies: ["Express", "GraphQL", "OpenAPI/Swagger"],
        endpoints: ["/graphql", "/swagger"],
        vulnerabilities: [
          {
            type: "api_security",
            severity: "medium",
            location: "/graphql",
            rationale: "Public GraphQL discovery can accelerate schema enumeration."
          }
        ],
        misconfigurations: ["Public API discovery tooling should be access controlled."],
        highValueTargets: ["/admin", "/graphql"],
        priority: "high",
        nextSteps: ["Validate authentication on /admin and /graphql."]
      };
    }
  } as unknown as LLMService;

  const phase = new ReconnaissancePhase(
    scanner,
    llm,
    createLogger() as never,
    {
      actor
    }
  );

  const result = await phase.execute("example.com");

  assert.equal(scannerCalls.length, 1);
  assert.equal(scannerCalls[0]?.actor.userId, actor.userId);
  assert.equal(scannerCalls[0]?.input.url, "https://example.com/");
  assert.equal(result.priority, "high");
  assert.equal(result.aiAnalysis.status, "ready");
  assert.equal(result.technologies.includes("Express"), true);
  assert.equal(result.technologies.includes("GraphQL"), true);
  assert.equal(result.endpoints.includes("https://example.com/admin"), true);
  assert.equal(result.endpoints.includes("https://example.com/graphql"), true);
  assert.equal(
    result.vulnerabilities.some(
      (vulnerability) =>
        vulnerability.location === "https://example.com/admin" &&
        vulnerability.severity === "high"
    ),
    true
  );
  assert.equal(
    result.vulnerabilities.some(
      (vulnerability) =>
        vulnerability.location === "https://example.com/graphql" &&
        vulnerability.type === "api_security"
    ),
    true
  );
  assert.equal(
    result.misconfigurations.some((entry) => entry.includes("Administrative routes")),
    true
  );
  assert.equal(result.highValueTargets.includes("/graphql"), true);
});

test("ReconnaissancePhase falls back cleanly when AI analysis is unavailable", async () => {
  const actor = createActor();
  const scanResult = createScanResult();

  const scanner = {
    async runReview() {
      return scanResult;
    }
  } as unknown as SecurityReviewLab;

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
      throw new Error("Local model offline");
    }
  } as unknown as LLMService;

  const phase = new ReconnaissancePhase(
    scanner,
    llm,
    createLogger() as never,
    {
      actor
    }
  );

  const result = await phase.execute("https://example.com");

  assert.equal(result.aiAnalysis.status, "unavailable");
  assert.equal(result.priority, "high");
  assert.equal(result.vulnerabilities.length >= 2, true);
  assert.equal(result.technologies.includes("Express"), true);
  assert.equal(result.endpoints.includes("https://example.com/admin"), true);
});

test("ReconnaissancePhase throws a clear error when SecurityReviewLab needs an actor", async () => {
  const scanResult = createScanResult();

  const scanner = {
    async runReview(
      _actor: AccessContext,
      _input: { url: string; maxPages?: number }
    ) {
      return scanResult;
    }
  } as unknown as SecurityReviewLab;

  const llm = {
    async listProviders() {
      return [];
    }
  } as unknown as LLMService;

  const phase = new ReconnaissancePhase(scanner, llm, createLogger() as never);

  await assert.rejects(
    phase.execute("https://example.com"),
    (error: unknown) =>
      error instanceof AppError &&
      error.message.includes("requires an AccessContext"),
    "Expected missing-actor configuration to raise an AppError"
  );
});
