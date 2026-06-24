import test from "node:test";
import assert from "node:assert/strict";

import { PolicyService } from "../src/services/policy/policy.service";
import { AccessContext } from "../src/authorization/authorization.types";

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
    permissions: ["chat", "tools", "agents", "rag", "admin_dashboard"]
  };
}

test("PolicyService prefers more specific scoped rules over global rules", async () => {
  const service = new PolicyService(
    {
      ensureWorkspaceModeAssignment: async () => undefined,
      listApplicablePolicies: async () => [
        {
          id: "policy-global",
          name: "Global Baseline",
          description: "Global baseline policy",
          mode: "enterprise",
          isSystem: true,
          isActive: true,
          metadata: {},
          rules: [
            {
              id: "rule-global",
              policyId: "policy-global",
              category: "database_queries",
              decision: "deny",
              enabled: true,
              priority: 100,
              toolNames: ["database-query"],
              roleScopes: [],
              workspaceRoleScopes: [],
              modelPatterns: [],
              conditions: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          assignments: [
            {
              id: "assign-global",
              policyId: "policy-global",
              scopeType: "global",
              assignmentType: "baseline",
              mode: "enterprise",
              priority: 100,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "policy-workspace",
          name: "Workspace Override",
          description: "Workspace override policy",
          mode: "custom",
          isSystem: false,
          isActive: true,
          metadata: {},
          rules: [
            {
              id: "rule-workspace",
              policyId: "policy-workspace",
              category: "database_queries",
              decision: "allow",
              enabled: true,
              priority: 300,
              toolNames: ["database-query"],
              roleScopes: [],
              workspaceRoleScopes: ["owner"],
              modelPatterns: [],
              conditions: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          assignments: [
            {
              id: "assign-workspace",
              policyId: "policy-workspace",
              scopeType: "workspace",
              scopeId: "workspace-1",
              assignmentType: "overlay",
              mode: "custom",
              priority: 100,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      getActiveWorkspaceModeAssignment: async () => ({
        id: "mode-1",
        policyId: "policy-enterprise",
        scopeType: "workspace",
        scopeId: "workspace-1",
        assignmentType: "mode",
        mode: "enterprise",
        priority: 100,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    } as never,
    {
      create: async () => undefined
    } as never
  );

  const result = await service.evaluatePolicy({
    actor: createActor(),
    action: "tools.execute",
    categories: ["database_queries"],
    toolName: "database-query",
    sql: "SELECT * FROM users",
    dryRun: true
  });

  assert.equal(result.decision, "allow");
  assert.equal(result.matchedRules[0]?.policyName, "Workspace Override");
});

test("PolicyService enforces restrictive defaults when no rule matches", async () => {
  const auditCalls: Array<{ decision: string; category: string }> = [];

  const service = new PolicyService(
    {
      ensureWorkspaceModeAssignment: async () => undefined,
      listApplicablePolicies: async () => [],
      getActiveWorkspaceModeAssignment: async () => ({
        id: "mode-1",
        policyId: "policy-enterprise",
        scopeType: "workspace",
        scopeId: "workspace-1",
        assignmentType: "mode",
        mode: "enterprise",
        priority: 100,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    } as never,
    {
      create: async (input: { decision: string; category: string }) => {
        auditCalls.push(input);
        return undefined;
      }
    } as never
  );

  await assert.rejects(
    service.evaluatePolicy({
      actor: createActor(),
      action: "tools.execute",
      categories: ["command_execution"],
      toolName: "command-execution",
      dryRun: false
    }),
    /Request denied by AI policy/
  );

  assert.equal(auditCalls[0]?.decision, "deny");
  assert.equal(auditCalls[0]?.category, "command_execution");
});
