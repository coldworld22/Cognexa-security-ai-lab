export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceSummary {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isPersonal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvitationSummary {
  id: string;
  workspaceId: string;
  workspaceName: string;
  organizationName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSession {
  currentWorkspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitationSummary[];
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
