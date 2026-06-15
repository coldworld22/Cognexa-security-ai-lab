import { BaseEntity } from "./base.entity";

export interface ToolExecutionEntity extends BaseEntity {
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: "started" | "completed" | "failed";
  errorMessage?: string;
}
