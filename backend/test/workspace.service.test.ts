import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceService } from "../src/services/workspace/workspace.service";

test("WorkspaceService provisions a personal workspace for users without memberships", async () => {
  let organizationCreates = 0;
  let workspaceCreates = 0;
  let membershipUpserts = 0;
  let currentWorkspaceUpdates = 0;

  const service = new WorkspaceService(
    {
      updateCurrentWorkspace: async () => {
        currentWorkspaceUpdates += 1;
      },
      findById: async () => null
    } as never,
    {
      create: async () => {
        organizationCreates += 1;
        return {
          id: "org-1",
          name: "User One Personal Organization",
          slug: "user-one-personal-organization",
          subscriptionPlan: "free",
          subscriptionStatus: "trialing",
          metadata: {
            personal: true
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } as never,
    {
      create: async () => {
        workspaceCreates += 1;
        return {
          id: "workspace-1",
          organizationId: "org-1",
          name: "User One Workspace",
          slug: "user-one-workspace",
          isPersonal: true,
          metadata: {
            personal: true
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } as never,
    {
      listWorkspaceSummariesForUser: async () => [],
      upsert: async () => {
        membershipUpserts += 1;
        return {
          id: "member-1",
          workspaceId: "workspace-1",
          userId: "user-1",
          role: "owner",
          joinedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } as never,
    {
      listPendingForEmail: async () => []
    } as never
  );

  const workspace = await service.ensureProvisionedForUser({
    id: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    passwordHash: "hash",
    role: "developer",
    preferences: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  assert.equal(workspace.id, "workspace-1");
  assert.equal(workspace.role, "owner");
  assert.equal(organizationCreates, 1);
  assert.equal(workspaceCreates, 1);
  assert.equal(membershipUpserts, 1);
  assert.equal(currentWorkspaceUpdates, 1);
});

test("WorkspaceService accepts invitations and switches the active workspace", async () => {
  let currentWorkspaceUpdates = 0;
  let acceptedInvitationId: string | null = null;
  let acceptedByUserId: string | null = null;

  const service = new WorkspaceService(
    {
      updateCurrentWorkspace: async (_userId: string, workspaceId: string) => {
        currentWorkspaceUpdates += 1;
        assert.equal(workspaceId, "workspace-2");
      },
      findById: async () => ({
        id: "user-1",
        email: "user-1@example.com",
        displayName: "User One",
        passwordHash: "hash",
        role: "developer",
        preferences: {},
        currentWorkspaceId: "workspace-2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    } as never,
    {} as never,
    {} as never,
    {
      listWorkspaceSummariesForUser: async () => [
        {
          id: "workspace-1",
          organizationId: "org-1",
          organizationName: "Org One",
          name: "Workspace One",
          slug: "workspace-one",
          role: "member",
          isPersonal: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "workspace-2",
          organizationId: "org-2",
          organizationName: "Org Two",
          name: "Workspace Two",
          slug: "workspace-two",
          role: "member",
          isPersonal: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      upsert: async () => ({
        id: "member-2",
        workspaceId: "workspace-2",
        userId: "user-1",
        role: "member",
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    } as never,
    {
      findById: async () => ({
        id: "invite-1",
        workspaceId: "workspace-2",
        email: "user-1@example.com",
        role: "member",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      markAccepted: async (invitationId: string, userId: string) => {
        acceptedInvitationId = invitationId;
        acceptedByUserId = userId;
        return {
          id: invitationId,
          workspaceId: "workspace-2",
          email: "user-1@example.com",
          role: "member",
          tokenHash: "hash",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          acceptedAt: new Date().toISOString(),
          acceptedByUserId: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      },
      listPendingForEmail: async () => []
    } as never
  );

  const session = await service.acceptInvitation(
    {
      userId: "user-1",
      email: "user-1@example.com",
      displayName: "User One",
      role: "developer",
      workspaceId: "workspace-1",
      workspaceName: "Workspace One",
      workspaceSlug: "workspace-one",
      workspaceRole: "member",
      organizationId: "org-1",
      organizationName: "Org One",
      isPersonalWorkspace: false,
      permissions: ["chat"]
    },
    "invite-1"
  );

  assert.equal(currentWorkspaceUpdates, 1);
  assert.equal(acceptedInvitationId, "invite-1");
  assert.equal(acceptedByUserId, "user-1");
  assert.equal(session.currentWorkspace.id, "workspace-2");
});
