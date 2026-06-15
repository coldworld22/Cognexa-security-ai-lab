import { BaseEntity } from "./base.entity";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface MessageEntity extends BaseEntity {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  metadata: Record<string, unknown>;
}
