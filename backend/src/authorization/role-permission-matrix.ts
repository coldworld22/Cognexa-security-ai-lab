import {
  CanonicalUserRole,
  Permission,
  UserRole
} from "./authorization.types";

export const ROLE_PERMISSION_MATRIX: Record<CanonicalUserRole, Permission[]> = {
  super_admin: [
    "chat",
    "memory",
    "rag",
    "agents",
    "tools",
    "admin_dashboard",
    "user_management"
  ],
  admin: [
    "chat",
    "memory",
    "rag",
    "agents",
    "tools",
    "admin_dashboard",
    "user_management"
  ],
  manager: [
    "chat",
    "memory",
    "rag",
    "agents",
    "tools",
    "admin_dashboard"
  ],
  developer: [
    "chat",
    "memory",
    "rag",
    "agents",
    "tools"
  ],
  viewer: ["chat", "rag"]
};

export function normalizeUserRole(role: UserRole): CanonicalUserRole {
  if (role === "user") {
    return "developer";
  }

  return role;
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSION_MATRIX[normalizeUserRole(role)];
}
