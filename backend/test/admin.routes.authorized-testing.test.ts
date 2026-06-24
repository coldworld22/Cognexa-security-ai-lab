import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";

import { AccessContext } from "../src/authorization/authorization.types";
import { AdminController } from "../src/api/controllers/admin.controller";
import { createAdminRoutes } from "../src/api/routes/admin.routes";
import { errorHandler } from "../src/api/middlewares/error-handler.middleware";
import {
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunSummary,
  DomainOwnershipVerificationSummary
} from "../src/services/authorized-testing/authorized-security-testing.types";

const VERIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

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

function createVerification(
  overrides: Partial<DomainOwnershipVerificationSummary> = {}
): DomainOwnershipVerificationSummary {
  return {
    id: VERIFICATION_ID,
    hostname: "example.com",
    method: "dns_txt",
    challengeToken: "token-123",
    challengeDetails: {
      requestedUrl: "https://example.com/app",
      recordName: "_cognexa-security-test.example.com",
      expectedValue: "cognexa-verification=token-123"
    },
    instructions: ["Create the required DNS TXT record on the verified hostname."],
    status: "pending",
    expiresAt: "2026-06-28T08:00:00.000Z",
    requestedByUserId: "user-1",
    createdAt: "2026-06-21T08:00:00.000Z",
    updatedAt: "2026-06-21T08:00:00.000Z",
    ...overrides
  };
}

function createRunSummary(
  overrides: Partial<AuthorizedSecurityTestRunSummary> = {}
): AuthorizedSecurityTestRunSummary {
  return {
    runId: RUN_ID,
    status: "completed",
    requestedUrl: "https://example.com/app",
    hostname: "example.com",
    executedAt: "2026-06-21T08:15:00.000Z",
    completedAt: "2026-06-21T08:16:00.000Z",
    riskLevel: "medium",
    findings: 1,
    highSeverityFindings: 0,
    ...overrides
  };
}

function createReport(
  overrides: Partial<AuthorizedSecurityTestReport> = {}
): AuthorizedSecurityTestReport {
  return {
    runId: RUN_ID,
    status: "completed",
    requestedByUserId: "user-1",
    executedAt: "2026-06-21T08:15:00.000Z",
    completedAt: "2026-06-21T08:16:00.000Z",
    target: {
      requestedUrl: "https://example.com/app",
      hostname: "example.com"
    },
    ownership: createVerification({
      status: "verified",
      verifiedAt: "2026-06-21T08:10:00.000Z"
    }),
    guardrails: [
      "Only verified public hostnames are in scope.",
      "Requests are limited to GET, HEAD, and OPTIONS."
    ],
    authProfiles: [
      {
        name: "low-privilege",
        role: "low_privilege",
        headerNames: ["authorization"],
        cookieNames: ["session"]
      }
    ],
    baseline: {
      requestedUrl: "https://example.com/app",
      finalUrl: "https://example.com/app",
      hostname: "example.com",
      pagesScanned: 3,
      maxPages: 4,
      securityScore: 64,
      grade: "C",
      passiveWarnings: ["Session cookies are missing SameSite."]
    },
    plan: [
      {
        id: "plan-1",
        category: "sql_injection",
        title: "Review reflected query behavior",
        objective: "Check search endpoints with inert SQL probe strings.",
        safeMethod: "GET only",
        stopConditions: ["Stop when the request budget is reached."]
      }
    ],
    summary: {
      riskLevel: "medium",
      headline: "A safe reflected-input weakness was confirmed.",
      planSource: "deterministic",
      requestBudget: 12,
      requestsSent: 7,
      modulesExecuted: ["sql_injection", "session_management"],
      findingCounts: {
        info: 0,
        low: 1,
        medium: 0,
        high: 0
      },
      recommendedActions: ["Parameterize search queries."],
      reversible: true
    },
    findings: [
      {
        id: "finding-1",
        category: "sql_injection",
        severity: "low",
        title: "Reflected SQL metacharacters in search parameter",
        summary: "The search page reflected inert probe values in the response.",
        evidence: ["GET /search?q='or'1'='1 reflected the probe verbatim."],
        remediation: "Use parameterized queries and normalize reflected output.",
        safeRetest: "Repeat the read-only GET request after the fix.",
        supportingEventIds: ["event-1"]
      }
    ],
    attackPaths: [
      {
        id: "path-1",
        title: "Reflected search input could aid follow-on input attacks",
        status: "constrained",
        narrative: "The current signal is limited to reflection and was not chained further.",
        supportingFindingIds: ["finding-1"],
        remediationPriority: "next",
        safeValidation: "Re-run the same read-only probe after the fix."
      }
    ],
    aiAnalysis: {
      status: "unavailable",
      nextSteps: ["Fix reflected input handling before broadening test scope."],
      unavailableReason: "No local model was available."
    },
    warnings: ["No high-privilege profile was provided for differential checks."],
    events: [
      {
        id: "event-1",
        eventType: "finding",
        severity: "low",
        message: "Reflected input pattern confirmed.",
        category: "sql_injection",
        metadata: {
          method: "GET",
          path: "/search"
        },
        createdAt: "2026-06-21T08:15:30.000Z"
      }
    ],
    ...overrides
  };
}

async function startServer() {
  const actor = createActor();
  const authorizationCalls: Array<{
    permission: string;
    resource: string;
    action: string;
  }> = [];
  const adminCalls = {
    listDomainVerifications: [] as number[],
    startDomainVerification: [] as Array<Record<string, unknown>>,
    checkDomainVerification: [] as string[],
    listAuthorizedSecurityTestRuns: [] as number[],
    getAuthorizedSecurityTestRun: [] as string[],
    runAuthorizedSecurityTest: [] as Array<Record<string, unknown>>
  };

  const verification = createVerification();
  const checkedVerification = createVerification({
    status: "verified",
    verifiedAt: "2026-06-21T08:10:00.000Z"
  });
  const runSummary = createRunSummary();
  const report = createReport();

  const admin = {
    listDomainVerifications: async (_actor: AccessContext, limit = 25) => {
      adminCalls.listDomainVerifications.push(limit);
      return [verification];
    },
    startDomainVerification: async (
      _actor: AccessContext,
      input: Record<string, unknown>
    ) => {
      adminCalls.startDomainVerification.push(input);
      return createVerification({
        method: (input.method as DomainOwnershipVerificationSummary["method"]) ?? "dns_txt"
      });
    },
    checkDomainVerification: async (
      _actor: AccessContext,
      verificationId: string
    ) => {
      adminCalls.checkDomainVerification.push(verificationId);
      return checkedVerification;
    },
    listAuthorizedSecurityTestRuns: async (_actor: AccessContext, limit = 20) => {
      adminCalls.listAuthorizedSecurityTestRuns.push(limit);
      return [runSummary];
    },
    getAuthorizedSecurityTestRun: async (_actor: AccessContext, runId: string) => {
      adminCalls.getAuthorizedSecurityTestRun.push(runId);
      return report;
    },
    runAuthorizedSecurityTest: async (
      _actor: AccessContext,
      input: Record<string, unknown>
    ) => {
      adminCalls.runAuthorizedSecurityTest.push(input);
      return report;
    }
  };

  const controller = new AdminController(admin as never, {} as never);
  const authorization = {
    assertPermission: async (
      _actor: AccessContext,
      permission: string,
      context: { resource: string; action: string }
    ) => {
      authorizationCalls.push({
        permission,
        resource: context.resource,
        action: context.action
      });
    }
  };

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.auth = actor;
    next();
  });
  app.use(
    "/admin",
    createAdminRoutes(controller, {} as never, authorization as never)
  );
  app.use(
    errorHandler({
      error: () => undefined
    } as never)
  );

  const server = await new Promise<Server>((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  const address = server.address() as AddressInfo;

  return {
    adminCalls,
    authorizationCalls,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("authorized testing admin routes reject invalid input", async (t) => {
  const server = await startServer();
  t.after(async () => {
    await server.close();
  });

  const invalidVerification = await fetch(
    `${server.baseUrl}/admin/authorized-testing/verifications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        target: "",
        method: "dns_txt"
      })
    }
  );

  assert.equal(invalidVerification.status, 400);
  assert.deepEqual(server.adminCalls.startDomainVerification, []);

  const invalidVerificationCheck = await fetch(
    `${server.baseUrl}/admin/authorized-testing/verifications/not-a-uuid/check`,
    {
      method: "POST"
    }
  );

  assert.equal(invalidVerificationCheck.status, 400);
  assert.deepEqual(server.adminCalls.checkDomainVerification, []);

  const invalidRun = await fetch(`${server.baseUrl}/admin/authorized-testing/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      verificationId: VERIFICATION_ID,
      url: "https://example.com/app",
      maxRequests: 3
    })
  });

  assert.equal(invalidRun.status, 400);
  assert.deepEqual(server.adminCalls.runAuthorizedSecurityTest, []);

  const invalidRunLookup = await fetch(
    `${server.baseUrl}/admin/authorized-testing/runs/not-a-uuid`
  );

  assert.equal(invalidRunLookup.status, 400);
  assert.deepEqual(server.adminCalls.getAuthorizedSecurityTestRun, []);
});

test("authorized testing admin routes shape validated requests and responses", async (t) => {
  const server = await startServer();
  t.after(async () => {
    await server.close();
  });

  const listVerifications = await fetch(
    `${server.baseUrl}/admin/authorized-testing/verifications?limit=3`
  );
  const listVerificationsBody = await readJson(listVerifications);
  assert.equal(listVerifications.status, 200);
  assert.equal(server.adminCalls.listDomainVerifications[0], 3);
  assert.deepEqual(
    listVerificationsBody.verifications,
    [createVerification()]
  );

  const startVerification = await fetch(
    `${server.baseUrl}/admin/authorized-testing/verifications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        target: "https://example.com"
      })
    }
  );
  const startVerificationBody = await readJson(startVerification);
  assert.equal(startVerification.status, 201);
  assert.deepEqual(server.adminCalls.startDomainVerification[0], {
    method: "dns_txt",
    target: "https://example.com"
  });
  assert.equal(
    (startVerificationBody.verification as Record<string, unknown>).id,
    VERIFICATION_ID
  );

  const checkVerification = await fetch(
    `${server.baseUrl}/admin/authorized-testing/verifications/${VERIFICATION_ID}/check`,
    {
      method: "POST"
    }
  );
  const checkVerificationBody = await readJson(checkVerification);
  assert.equal(checkVerification.status, 200);
  assert.deepEqual(server.adminCalls.checkDomainVerification, [VERIFICATION_ID]);
  assert.equal(
    (checkVerificationBody.verification as Record<string, unknown>).status,
    "verified"
  );

  const listRuns = await fetch(
    `${server.baseUrl}/admin/authorized-testing/runs?limit=2`
  );
  const listRunsBody = await readJson(listRuns);
  assert.equal(listRuns.status, 200);
  assert.equal(server.adminCalls.listAuthorizedSecurityTestRuns[0], 2);
  assert.deepEqual(listRunsBody.runs, [createRunSummary()]);

  const runTest = await fetch(`${server.baseUrl}/admin/authorized-testing/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      verificationId: VERIFICATION_ID,
      url: "https://example.com/app",
      maxPages: "5",
      maxRequests: "12",
      modules: ["sql_injection", "session_management"],
      authProfiles: [
        {
          name: "low-privilege",
          role: "low_privilege",
          headers: {
            authorization: "Bearer token"
          },
          cookies: {
            session: "cookie-value"
          }
        }
      ]
    })
  });
  const runTestBody = await readJson(runTest);
  assert.equal(runTest.status, 201);
  assert.deepEqual(server.adminCalls.runAuthorizedSecurityTest[0], {
    verificationId: VERIFICATION_ID,
    url: "https://example.com/app",
    maxPages: 5,
    maxRequests: 12,
    modules: ["sql_injection", "session_management"],
    authProfiles: [
      {
        name: "low-privilege",
        role: "low_privilege",
        headers: {
          authorization: "Bearer token"
        },
        cookies: {
          session: "cookie-value"
        }
      }
    ]
  });
  assert.equal(runTestBody.runId, RUN_ID);

  const getRun = await fetch(
    `${server.baseUrl}/admin/authorized-testing/runs/${RUN_ID}`
  );
  const getRunBody = await readJson(getRun);
  assert.equal(getRun.status, 200);
  assert.deepEqual(server.adminCalls.getAuthorizedSecurityTestRun, [RUN_ID]);
  assert.equal(getRunBody.runId, RUN_ID);

  assert.deepEqual(
    server.authorizationCalls.map((call) => call.permission),
    [
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard"
    ]
  );
});
