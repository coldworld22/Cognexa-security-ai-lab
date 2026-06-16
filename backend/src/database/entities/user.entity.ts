import { BaseEntity } from "./base.entity";
import { UserRole } from "../../authorization/authorization.types";

export interface UserEntity extends BaseEntity {
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  preferences: Record<string, unknown>;
  currentWorkspaceId?: string;
  lastLoginAt?: string;
}
