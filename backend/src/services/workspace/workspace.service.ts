import { createHash, randomUUID } from "crypto";

import { AccessContext } from "../../authorization/authorization.types";
import { UserEntity } from "../../database/entities/user.entity";
import { OrganizationRepository } from "../../database/repositories/organization.repository";
import { UserRepository } from "../../database/repositories/user.repository";
import { WorkspaceInvitationRepository } from "../../database/repositories/workspace-invitation.repository";
import { WorkspaceMemberRepository } from "../../database/repositories/workspace-member.repository";
import { WorkspaceRepository } from "../../database/repositories/workspace.repository";
import { AppError } from "../../utils/app-error";
import {
  canManageWorkspace,
  WorkspaceInvitationSummary,
  WorkspaceRole,
  WorkspaceSession,
  WorkspaceSummary
} from "../../workspaces/workspace.types";
import { PolicyService } from "../policy/policy.service";

interface CreateWorkspaceInput {
  name: string;
  organizationName?: string;
}

interface CreateWorkspaceInvitationInput {
  email: string;
  role: WorkspaceRole;
}

interface ResolveWorkspaceSelectionResult {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export class WorkspaceService {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly members: WorkspaceMemberRepository,
    private readonly invitations: WorkspaceInvitationRepository,
    private readonly policy: PolicyService
  ) {}

  async ensureProvisionedForUser(user: UserEntity): Promise<WorkspaceSummary> {
    const summaries = await this.members.listWorkspaceSummariesForUser(user.id);
    if (summaries.length > 0) {
      return this.resolveCurrentWorkspace(user, summaries);
    }

    const organization = await this.organizations.create({
      name: `${user.displayName} Personal Organization`,
      slug: this.createSlug(`${user.displayName}-personal-org`),
      billingEmail: user.email,
      subscriptionPlan: "free",
      subscriptionStatus: "trialing",
      metadata: {
        personal: true
      },
      createdByUserId: user.id
    });

    const workspace = await this.workspaces.create({
      organizationId: organization.id,
      name: `${user.displayName} Workspace`,
      slug: this.createSlug(`${user.displayName}-workspace`),
      isPersonal: true,
      metadata: {
        personal: true
      },
      createdByUserId: user.id
    });

    await this.members.upsert({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      invitedByUserId: user.id
    });
    await this.users.updateCurrentWorkspace(user.id, workspace.id);
    await this.policy.ensureWorkspaceDefaults(workspace.id, user.id);

    return {
      id: workspace.id,
      organizationId: organization.id,
      organizationName: organization.name,
      name: workspace.name,
      slug: workspace.slug,
      role: "owner",
      isPersonal: workspace.isPersonal,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    };
  }

  async listSession(userId: string): Promise<WorkspaceSession> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError("Authenticated user not found", 401);
    }

    return this.listSessionForUser(user);
  }

  async listSessionForUser(user: UserEntity): Promise<WorkspaceSession> {
    await this.ensureProvisionedForUser(user);

    const workspaces = await this.members.listWorkspaceSummariesForUser(user.id);
    if (workspaces.length === 0) {
      throw new AppError("No workspace membership found for user", 403);
    }

    const currentWorkspace = this.resolveCurrentWorkspace(user, workspaces);
    const pendingInvitations = await this.invitations.listPendingForEmail(user.email);

    return {
      currentWorkspace,
      workspaces,
      pendingInvitations
    };
  }

  async listWorkspaceIdsForUser(userId: string): Promise<string[]> {
    const workspaces = await this.members.listWorkspaceSummariesForUser(userId);
    return workspaces.map((workspace) => workspace.id);
  }

  async resolveWorkspaceSelection(
    user: UserEntity,
    requestedWorkspaceId?: string
  ): Promise<ResolveWorkspaceSelectionResult> {
    await this.ensureProvisionedForUser(user);

    const workspaces = await this.members.listWorkspaceSummariesForUser(user.id);
    if (workspaces.length === 0) {
      throw new AppError("No workspace membership found for user", 403);
    }

    const workspace =
      (requestedWorkspaceId
        ? workspaces.find((candidate) => candidate.id === requestedWorkspaceId)
        : null) ?? this.resolveCurrentWorkspace(user, workspaces);

    if (!workspace) {
      throw new AppError("Workspace not found for current user", 403, {
        workspaceId: requestedWorkspaceId
      });
    }

    return {
      workspace,
      workspaces
    };
  }

  async switchWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceSession> {
    const session = await this.listSession(userId);
    const nextWorkspace = session.workspaces.find(
      (workspace) => workspace.id === workspaceId
    );

    if (!nextWorkspace) {
      throw new AppError("Workspace not found for current user", 403, {
        workspaceId
      });
    }

    await this.users.updateCurrentWorkspace(userId, workspaceId);

    return {
      ...session,
      currentWorkspace: nextWorkspace
    };
  }

  async createWorkspace(
    actor: AccessContext,
    input: CreateWorkspaceInput
  ): Promise<WorkspaceSession> {
    const workspaceName = input.name.trim();
    const organizationName =
      input.organizationName?.trim() || `${workspaceName} Organization`;

    if (!workspaceName) {
      throw new AppError("Workspace name is required", 400);
    }

    const organization = await this.organizations.create({
      name: organizationName,
      slug: this.createSlug(organizationName),
      billingEmail: actor.email,
      subscriptionPlan: "free",
      subscriptionStatus: "trialing",
      createdByUserId: actor.userId
    });

    const workspace = await this.workspaces.create({
      organizationId: organization.id,
      name: workspaceName,
      slug: this.createSlug(workspaceName),
      createdByUserId: actor.userId
    });

    await this.members.upsert({
      workspaceId: workspace.id,
      userId: actor.userId,
      role: "owner",
      invitedByUserId: actor.userId
    });
    await this.users.updateCurrentWorkspace(actor.userId, workspace.id);
    await this.policy.ensureWorkspaceDefaults(workspace.id, actor.userId);

    return this.listSession(actor.userId);
  }

  async createInvitation(
    actor: AccessContext,
    input: CreateWorkspaceInvitationInput
  ): Promise<WorkspaceInvitationSummary & { invitationToken: string }> {
    this.assertWorkspaceManagement(actor);

    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AppError("Invitation email is required", 400);
    }

    if (await this.members.hasWorkspaceMemberWithEmail(actor.workspaceId, normalizedEmail)) {
      throw new AppError("User is already a member of this workspace", 409);
    }

    const invitationToken = `${randomUUID()}${randomUUID().replace(/-/g, "")}`;
    const invitation = await this.invitations.createOrReplacePending({
      workspaceId: actor.workspaceId,
      email: normalizedEmail,
      role: input.role,
      tokenHash: this.hashInvitationToken(invitationToken),
      invitedByUserId: actor.userId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString()
    });

    return {
      id: invitation.id,
      workspaceId: actor.workspaceId,
      workspaceName: actor.workspaceName,
      organizationName: actor.organizationName,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
      invitationToken
    };
  }

  async acceptInvitation(
    actor: AccessContext,
    invitationId: string
  ): Promise<WorkspaceSession> {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation) {
      throw new AppError("Invitation not found", 404);
    }

    if (invitation.acceptedAt) {
      throw new AppError("Invitation has already been accepted", 409);
    }

    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new AppError("Invitation has expired", 410);
    }

    if (invitation.email.toLowerCase() !== actor.email.toLowerCase()) {
      throw new AppError("Invitation email does not match the authenticated user", 403);
    }

    await this.members.upsert({
      workspaceId: invitation.workspaceId,
      userId: actor.userId,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId
    });
    await this.invitations.markAccepted(invitation.id, actor.userId);
    await this.users.updateCurrentWorkspace(actor.userId, invitation.workspaceId);

    return this.listSession(actor.userId);
  }

  private resolveCurrentWorkspace(
    user: Pick<UserEntity, "currentWorkspaceId">,
    workspaces: WorkspaceSummary[]
  ): WorkspaceSummary {
    return (
      workspaces.find((workspace) => workspace.id === user.currentWorkspaceId) ??
      workspaces[0]!
    );
  }

  private assertWorkspaceManagement(actor: AccessContext): void {
    if (!canManageWorkspace(actor.workspaceRole)) {
      throw new AppError("Workspace administration requires owner or admin role", 403);
    }
  }

  private createSlug(input: string): string {
    const base = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

    const safeBase = base || "workspace";
    return `${safeBase}-${randomUUID().slice(0, 8)}`;
  }

  private hashInvitationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
