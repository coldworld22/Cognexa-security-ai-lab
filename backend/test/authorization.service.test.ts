import test from "node:test";
import assert from "node:assert/strict";

import { AuthorizationService } from "../src/services/authorization/authorization.service";

test("AuthorizationService resolves permissions from role and caches the actor context", async () => {
  let userReads = 0;
  const redisStore = new Map<string, string>();

  const service = new AuthorizationService(
    {
      findById: async () => {
        userReads += 1;
        return {
          id: "user-1",
          email: "user-1@example.com",
          displayName: "User One",
          passwordHash: "hash",
          role: "manager",
          preferences: {},
          currentWorkspaceId: "workspace-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } as never,
    {
      create: async () => undefined
    } as never,
    {
      get: async (key: string) => redisStore.get(key) ?? null,
      set: async (key: string, value: string) => {
        redisStore.set(key, value);
        return "OK";
      },
      del: async () => 1
    } as never,
    {
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      resolveWorkspaceSelection: async () => ({
        workspace: {
          id: "workspace-1",
          organizationId: "org-1",
          organizationName: "Org One",
          name: "Workspace One",
          slug: "workspace-one",
          role: "owner",
          isPersonal: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        workspaces: []
      }),
      listWorkspaceIdsForUser: async () => ["workspace-1"]
    } as never,
    {
      cacheTtlSeconds: 300
    }
  );

  const actor = await service.getUserAccessContext("user-1");
  const permissions = await service.getPermissionsForActor(actor);
  const cachedActor = await service.getUserAccessContext("user-1");

  assert.equal(userReads, 1);
  assert.equal(actor.role, "manager");
  assert.deepEqual(actor, cachedActor);
  assert.ok(permissions.includes("admin_dashboard"));
  assert.ok(!permissions.includes("user_management"));
});

test("AuthorizationService audits denied access", async () => {
  const auditEvents: Array<Record<string, unknown>> = [];

  const service = new AuthorizationService(
    {
      findById: async () => null
    } as never,
    {
      create: async (input) => {
        auditEvents.push(input);
      }
    } as never,
    {
      get: async () => null,
      set: async () => "OK",
      del: async () => 1
    } as never,
    {
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      resolveWorkspaceSelection: async () => {
        throw new Error("not used");
      },
      listWorkspaceIdsForUser: async () => []
    } as never,
    {
      cacheTtlSeconds: 300
    }
  );

  await assert.rejects(
    service.assertPermission(
      {
        userId: "user-2",
        email: "viewer@example.com",
        displayName: "Viewer",
        role: "viewer",
        workspaceId: "workspace-1",
        workspaceName: "Workspace One",
        workspaceSlug: "workspace-one",
        workspaceRole: "viewer",
        organizationId: "org-1",
        organizationName: "Org One",
        isPersonalWorkspace: false,
        permissions: ["chat"]
      },
      "tools",
      {
        layer: "tool",
        resource: "tools.web-search",
        action: "execute_tool",
        reason: "Tool requires tools permission"
      }
    ),
    /Forbidden/
  );

  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.permission, "tools");
  assert.equal(auditEvents[0]?.outcome, "denied");
});
