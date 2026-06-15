import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { ToolExecutionEntity } from "../entities/tool-execution.entity";

interface CreateToolExecutionInput {
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: ToolExecutionEntity["status"];
  errorMessage?: string;
}

export class ToolExecutionRepository extends BaseRepository {
  async create(input: CreateToolExecutionInput): Promise<ToolExecutionEntity> {
    const entity: ToolExecutionEntity = {
      id: randomUUID(),
      taskId: input.taskId,
      toolName: input.toolName,
      inputPayload: input.inputPayload,
      outputPayload: input.outputPayload,
      status: input.status,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO tool_executions (id, task_id, tool_name, input_payload, output_payload, status, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
      [
        entity.id,
        entity.taskId ?? null,
        entity.toolName,
        JSON.stringify(entity.inputPayload),
        JSON.stringify(entity.outputPayload),
        entity.status,
        entity.errorMessage ?? null,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM tool_executions"
    );
    return result.rows[0]?.count ?? 0;
  }
}
