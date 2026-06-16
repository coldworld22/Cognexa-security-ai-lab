import { WorkspaceRole } from "../workspaces/workspace.types";

export type Permission =
  | "chat"
  | "memory"
  | "rag"
  | "agents"
  | "tools"
  | "admin_dashboard"
  | "user_management";

export type CanonicalUserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "developer"
  | "viewer";

export type UserRole = CanonicalUserRole | "user";

export interface AccessContext {
  userId: string;
  email: string;
  displayName: string;
  role: CanonicalUserRole;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
  organizationId: string;
  organizationName: string;
  isPersonalWorkspace: boolean;
  permissions?: Permission[];
}

export interface AuthorizationAuditEvent {
  actor?: Partial<AccessContext> & {
    userId?: string;
    email?: string;
    role?: string;
  };
  permission: Permission;
  layer: "route" | "service" | "tool";
  resource: string;
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
}
