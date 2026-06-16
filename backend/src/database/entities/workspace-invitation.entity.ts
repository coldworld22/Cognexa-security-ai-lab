import { BaseEntity } from "./base.entity";
import { WorkspaceRole } from "../../workspaces/workspace.types";

export interface WorkspaceInvitationEntity extends BaseEntity {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedByUserId?: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
}
