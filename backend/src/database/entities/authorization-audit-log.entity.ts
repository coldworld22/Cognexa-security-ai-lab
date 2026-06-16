import { BaseEntity } from "./base.entity";
import { Permission } from "../../authorization/authorization.types";

export interface AuthorizationAuditLogEntity extends BaseEntity {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  permission: Permission;
  layer: "route" | "service" | "tool";
  resource: string;
  action: string;
  outcome: "denied";
  reason: string;
  metadata: Record<string, unknown>;
}
