import test from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../src/utils/app-error";
import { ToolExecutionService } from "../src/services/tool-execution/tool-execution.service";

test("ToolExecutionService blocks execution when authorization fails", async () => {
  let executed = false;

  const service = new ToolExecutionService(
    {
      get: () => ({
        execute: async () => {
          executed = true;
          return { ok: true };
        }
      })
    } as never,
    {
      create: async () => {
        throw new Error("execution records should not be created on denied access");
      }
    } as never,
    {
      assertPermission: async () => {
        throw new AppError("Forbidden", 403);
      }
    } as never
  );

  await assert.rejects(
    service.execute(
      "web-search",
      {
        query: "security"
      },
      {
        actor: {
          userId: "user-1",
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
        resource: "tools.web-search",
        action: "execute_tool",
        reason: "Tool requires tools permission"
      }
    ),
    /Forbidden/
  );

  assert.equal(executed, false);
});

test("ToolExecutionService lists blocked tools without failing the catalog preview", async () => {
  const service = new ToolExecutionService(
    {
      list: () => [
        {
          name: "database-query",
          description: "Run database queries",
          category: "database",
          inputSchema: {}
        }
      ]
    } as never,
    {} as never,
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "deny",
        blocking: true,
        requiresApproval: false,
        warnings: [],
        matchedRules: [],
        mode: "enterprise",
        evaluatedAt: new Date().toISOString()
      })
    } as never
  );

  const tools = await service.listTools({
    userId: "user-1",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: ["chat", "tools"]
  });

  assert.equal(tools[0]?.name, "database-query");
  assert.equal(tools[0]?.policyDecision, "deny");
  assert.equal(tools[0]?.blocked, true);
});
