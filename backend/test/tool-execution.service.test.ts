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
