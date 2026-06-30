import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { EventEmitter } from "node:events";

import express from "express";

import { AccessContext } from "../src/authorization/authorization.types";
import { PenetrationTestController } from "../src/api/controllers/penetration-test.controller";
import { createPenetrationTestRoutes } from "../src/api/routes/penetration-test.routes";
import { errorHandler } from "../src/api/middlewares/error-handler.middleware";
import type {
  AdvancedPenetrationTestRunDetail,
  AdvancedPenetrationTestRunSummary
} from "../src/services/admin/admin.service";

const RUN_ID = "33333333-3333-4333-8333-333333333333";
const VERIFICATION_ID = "11111111-1111-4111-8111-111111111111";

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

function createRunSummary(
  overrides: Partial<AdvancedPenetrationTestRunSummary> = {}
): AdvancedPenetrationTestRunSummary {
  return {
    runId: RUN_ID,
    taskId: "task-1",
    agentId: "agent-1",
    target: "https://example.com/app",
    status: "completed",
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:02:00.000Z",
    startedAt: "2026-06-25T10:00:05.000Z",
    completedAt: "2026-06-25T10:02:00.000Z",
    vulnerabilities: 2,
    attackChains: 1,
    finalSummary: "The advanced run chained authentication and authorization weaknesses.",
    ...overrides
  };
}

function createRunDetail(
  overrides: Partial<AdvancedPenetrationTestRunDetail> = {}
): AdvancedPenetrationTestRunDetail {
  return {
    ...createRunSummary(),
    context: {
      target: "https://example.com/app",
      currentPhase: "complete"
    },
    auditTrail: [
      {
        id: "audit-1",
        action: "run.started",
        data: {
          target: "https://example.com/app"
        },
        timestamp: "2026-06-25T10:00:05.000Z"
      }
    ],
    report: {
      id: RUN_ID,
      target: "https://example.com/app",
      executiveSummary: "The advanced run confirmed a chained access-control failure."
    },
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
    listRuns: [] as number[],
    getRun: [] as string[],
    getReport: [] as string[],
    startStream: [] as Array<Record<string, unknown>>
  };

  const summary = createRunSummary();
  const detail = createRunDetail();
  const emitter = new EventEmitter();
  const orchestrator = {
    getEventEmitter: () => emitter,
    run: async () => {
      emitter.emit("update", {
        id: "event-1",
        runId: RUN_ID,
        type: "phase",
        phase: "execution",
        message: "Execution phase started.",
        timestamp: "2026-06-25T10:00:10.000Z",
        data: {
          title: "Execution Phase"
        }
      });

      return detail.report;
    }
  };

  const admin = {
    listAdvancedPenetrationTests: async (_actor: AccessContext, limit = 20) => {
      adminCalls.listRuns.push(limit);
      return [summary];
    },
    getAdvancedPenetrationTestRun: async (_actor: AccessContext, runId: string) => {
      adminCalls.getRun.push(runId);
      return createRunDetail({
        runId
      });
    },
    getAdvancedPenetrationTestReport: async (_actor: AccessContext, runId: string) => {
      adminCalls.getReport.push(runId);
      return {
        id: runId,
        target: "https://example.com/app"
      };
    },
    startAdvancedPenetrationTest: async (
      _actor: AccessContext,
      input: Record<string, unknown>
    ) => {
      adminCalls.startStream.push(input);
      return orchestrator;
    }
  };

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

  const controller = new PenetrationTestController(
    admin as never,
    {
      child() {
        return this;
      },
      info() {},
      warn() {},
      error() {}
    } as never
  );

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.auth = actor;
    next();
  });
  app.use(
    "/admin/authorized-testing/advanced-runs",
    createPenetrationTestRoutes(controller, authorization as never)
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

test("advanced penetration test routes reject invalid stream input", async (t) => {
  const server = await startServer();
  t.after(async () => {
    await server.close();
  });

  const invalidStream = await fetch(
    `${server.baseUrl}/admin/authorized-testing/advanced-runs/stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        target: "https://example.com/app"
      })
    }
  );

  assert.equal(invalidStream.status, 400);
  assert.deepEqual(server.adminCalls.startStream, []);
});

test("advanced penetration test routes list runs, fetch reports, and stream SSE updates", async (t) => {
  const server = await startServer();
  t.after(async () => {
    await server.close();
  });

  const listRuns = await fetch(
    `${server.baseUrl}/admin/authorized-testing/advanced-runs?limit=3`
  );
  const listRunsBody = await readJson(listRuns);
  assert.equal(listRuns.status, 200);
  assert.equal(server.adminCalls.listRuns[0], 3);
  assert.deepEqual(listRunsBody.runs, [createRunSummary()]);

  const getRun = await fetch(
    `${server.baseUrl}/admin/authorized-testing/advanced-runs/${RUN_ID}`
  );
  const getRunBody = await readJson(getRun);
  assert.equal(getRun.status, 200);
  assert.equal((getRunBody.run as Record<string, unknown>).runId, RUN_ID);

  const getReport = await fetch(
    `${server.baseUrl}/admin/authorized-testing/advanced-runs/${RUN_ID}/report`
  );
  const getReportBody = await readJson(getReport);
  assert.equal(getReport.status, 200);
  assert.equal((getReportBody.report as Record<string, unknown>).id, RUN_ID);

  const stream = await fetch(
    `${server.baseUrl}/admin/authorized-testing/advanced-runs/stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        target: "https://example.com/app",
        verificationId: VERIFICATION_ID,
        maxPages: "5",
        maxRequests: "12",
        authEndpointDescriptors: [
          {
            type: "auth_api",
            name: "corporate-login",
            entryUrl: "https://example.com/login",
            endpoint: "https://example.com/api/login",
            fields: ["corporateId", "userId", "password"]
          }
        ],
        manualFormValidation: {
          rateLimitPerMinute: "5",
          credentialLabels: ["qa-corporate-admin"],
          notes: "Manual POST validation only."
        }
      })
    }
  );

  const streamBody = await stream.text();
  assert.equal(stream.status, 200);
  assert.equal(
    stream.headers.get("content-type")?.startsWith("text/event-stream"),
    true
  );
  assert.equal(server.adminCalls.startStream.length, 1);
  assert.equal(
    server.adminCalls.startStream[0]?.verificationId,
    VERIFICATION_ID
  );
  assert.equal(server.adminCalls.startStream[0]?.maxPages, 5);
  assert.equal(server.adminCalls.startStream[0]?.maxRequests, 12);
  assert.deepEqual(server.adminCalls.startStream[0]?.authEndpointDescriptors, [
    {
      type: "auth_api",
      name: "corporate-login",
      entryUrl: "https://example.com/login",
      endpoint: "https://example.com/api/login",
      fields: ["corporateId", "userId", "password"]
    }
  ]);
  assert.deepEqual(server.adminCalls.startStream[0]?.manualFormValidation, {
    rateLimitPerMinute: 5,
    credentialLabels: ["qa-corporate-admin"],
    notes: "Manual POST validation only."
  });
  assert.match(streamBody, /event: started/);
  assert.match(streamBody, /event: update/);
  assert.match(streamBody, /event: finished/);

  assert.deepEqual(
    server.authorizationCalls.map((call) => call.permission),
    [
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard",
      "admin_dashboard"
    ]
  );
});
