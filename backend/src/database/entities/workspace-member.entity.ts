import { BaseEntity } from "./base.entity";
import { WorkspaceRole } from "../../workspaces/workspace.types";

export interface WorkspaceMemberEntity extends BaseEntity {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedByUserId?: string;
  joinedAt: string;
}
