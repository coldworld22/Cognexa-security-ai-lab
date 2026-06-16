import { BaseEntity } from "./base.entity";

export interface ConversationEntity extends BaseEntity {
  workspaceId: string;
  userId: string;
  title: string;
  modelProvider: string;
  modelName: string;
  metadata: Record<string, unknown>;
}
