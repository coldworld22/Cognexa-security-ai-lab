import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { ToolExecutionEntity } from "../entities/tool-execution.entity";

interface CreateToolExecutionInput {
  workspaceId: string;
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: ToolExecutionEntity["status"];
  errorMessage?: string;
}

export class ToolExecutionRepository extends BaseRepository {
  private mapRow(row: Record<string, unknown>): ToolExecutionEntity {
    return {
      id: row.id as string,
      workspaceId: (row.workspace_id as string | null) ?? undefined,
      taskId: (row.task_id as string | null) ?? undefined,
      toolName: row.tool_name as string,
      inputPayload: row.input_payload as Record<string, unknown>,
      outputPayload: row.output_payload as Record<string, unknown>,
      status: row.status as ToolExecutionEntity["status"],
      errorMessage: (row.error_message as string | null) ?? undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  async create(input: CreateToolExecutionInput): Promise<ToolExecutionEntity> {
    const entity: ToolExecutionEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
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
      `INSERT INTO tool_executions (
         id,
         workspace_id,
         task_id,
         tool_name,
         input_payload,
         output_payload,
         status,
         error_message,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
      [
        entity.id,
        entity.workspaceId ?? null,
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

  async findByTaskId(taskId: string): Promise<ToolExecutionEntity[]> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, task_id, tool_name, input_payload, output_payload, status, error_message, created_at, updated_at
       FROM tool_executions
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [taskId]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async update(
    id: string,
    input: {
      outputPayload?: Record<string, unknown>;
      status?: ToolExecutionEntity["status"];
      errorMessage?: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE tool_executions
       SET output_payload = COALESCE($2::jsonb, output_payload),
           status = COALESCE($3, status),
           error_message = COALESCE($4, error_message),
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.outputPayload ? JSON.stringify(input.outputPayload) : null,
        input.status ?? null,
        input.errorMessage ?? null
      ]
    );
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM tool_executions"
    );
    return result.rows[0]?.count ?? 0;
  }

  async getSummary(): Promise<{
    total: number;
    completed: number;
    failed: number;
    started: number;
    successRate: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'started')::int AS started
       FROM tool_executions`
    );

    const row = result.rows[0];
    const total = row?.total ?? 0;
    const completed = row?.completed ?? 0;

    return {
      total,
      completed,
      failed: row?.failed ?? 0,
      started: row?.started ?? 0,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }
}
