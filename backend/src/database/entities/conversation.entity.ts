import { BaseEntity } from "./base.entity";

export interface ConversationEntity extends BaseEntity {
  userId: string;
  title: string;
  modelProvider: string;
  modelName: string;
  metadata: Record<string, unknown>;
}
