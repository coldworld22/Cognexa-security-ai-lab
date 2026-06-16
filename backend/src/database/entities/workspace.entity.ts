import { BaseEntity } from "./base.entity";

export interface WorkspaceEntity extends BaseEntity {
  organizationId: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  metadata: Record<string, unknown>;
  createdByUserId?: string;
}
