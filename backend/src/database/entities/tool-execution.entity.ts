import { BaseEntity } from "./base.entity";

export interface ToolExecutionEntity extends BaseEntity {
  workspaceId?: string;
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: "started" | "completed" | "failed";
  errorMessage?: string;
}
