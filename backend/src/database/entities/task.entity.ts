import { BaseEntity } from "./base.entity";

export interface TaskEntity extends BaseEntity {
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: string;
}
