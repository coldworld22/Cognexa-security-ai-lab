import { BaseEntity } from "./base.entity";
import { RetrievalContextMetadata } from "../../rag/retrieval/retrieval-context.types";

export type TaskStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface TaskStepTrace {
  id: string;
  title: string;
  rationale: string;
  status: TaskStepStatus;
  startedAt?: string;
  finishedAt?: string;
  note?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolExecutionId?: string;
  toolOutputPreview?: string;
  error?: string;
}

export interface TaskMetadata {
  steps: TaskStepTrace[];
  executedTools: string[];
  reasoningLog: string[];
  retrieval?: RetrievalContextMetadata;
  finalSummary?: string;
  lastUpdatedAt?: string;
}

export interface TaskEntity extends BaseEntity {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: string;
  metadata: TaskMetadata;
}
