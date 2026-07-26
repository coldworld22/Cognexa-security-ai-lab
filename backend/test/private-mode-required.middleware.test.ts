import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";

import { createPrivateModeRequiredMiddleware } from "../src/api/middlewares/private-mode-required.middleware";

function createActor(overrides: Partial<{
  workspaceId: string;
  permissions: string[];
}> = {}) {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role: "developer",
    workspaceId: overrides.workspaceId ?? "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "member",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: overrides.permissions ?? ["chat"]
  };
}

async function startServer(input: {
  activeWorkspaceIds?: string[];
  actorPermissions?: string[];
}) {
  const activeWorkspaceIds = new Set(input.activeWorkspaceIds ?? []);
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.auth = createActor({
      permissions: input.actorPermissions
    });
    next();
  });
  app.use(
    createPrivateModeRequiredMiddleware({
      getActiveSession: async (workspaceId: string) =>
        activeWorkspaceIds.has(workspaceId)
          ? {
              id: "session-1",
              workspaceId,
              strategy: "tor",
              exitNodes: [],
              circuitIds: [],
              startedAt: new Date().toISOString()
            }
          : null
    } as never)
  );
  app.get("/auth/session", (_request, response) => {
    response.json({
      ok: true
    });
  });
  app.get("/admin/private-mode/session", (_request, response) => {
    response.json({
      ok: true
    });
  });
  app.get("/admin/dashboard", (_request, response) => {
    response.json({
      ok: true
    });
  });
  app.get("/chat/ping", (_request, response) => {
    response.json({
      ok: true
    });
  });

  const server = await new Promise<Server>((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  const address = server.address() as AddressInfo;

  return {
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

test("private mode middleware allows exempt authenticated routes while inactive", async (t) => {
  const server = await startServer({});
  t.after(async () => {
    await server.close();
  });

  const authSession = await fetch(`${server.baseUrl}/auth/session`);
  const privateModeSession = await fetch(`${server.baseUrl}/admin/private-mode/session`);
  const adminDashboard = await fetch(`${server.baseUrl}/admin/dashboard`);

  assert.equal(authSession.status, 200);
  assert.equal(privateModeSession.status, 200);
  assert.equal(adminDashboard.status, 200);
});

test("private mode middleware blocks non-exempt routes for non-admin users while inactive", async (t) => {
  const server = await startServer({});
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/chat/ping`);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "This workspace is locked until an administrator activates Private Mode.",
    privateModeRequired: true,
    canActivatePrivateMode: false,
    redirectPath: "/private-mode-required"
  });
});

test("private mode middleware returns the activation path for admin-capable users while inactive", async (t) => {
  const server = await startServer({
    actorPermissions: ["chat", "admin_dashboard"]
  });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/chat/ping`);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Private Mode must be activated before using this workspace.",
    privateModeRequired: true,
    canActivatePrivateMode: true,
    redirectPath: "/admin/private-mode"
  });
});

test("private mode middleware allows non-exempt routes when the workspace has an active private mode session", async (t) => {
  const server = await startServer({
    activeWorkspaceIds: ["workspace-1"]
  });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/chat/ping`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true
  });
});
