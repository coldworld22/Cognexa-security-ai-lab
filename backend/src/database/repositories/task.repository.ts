import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { TaskEntity } from "../entities/task.entity";

interface CreateTaskInput {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: TaskEntity["status"];
  metadata?: TaskEntity["metadata"];
  result?: string;
}

interface UpdateTaskStateInput {
  status?: TaskEntity["status"];
  result?: string;
  metadata?: TaskEntity["metadata"];
}

function createDefaultMetadata(): TaskEntity["metadata"] {
  return {
    steps: [],
    executedTools: [],
    reasoningLog: []
  };
}

export class TaskRepository extends BaseRepository {
  private mapRow(row: Record<string, unknown>): TaskEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      agentId: row.agent_id as string,
      conversationId: (row.conversation_id as string | null) ?? undefined,
      title: row.title as string,
      objective: row.objective as string,
      status: row.status as TaskEntity["status"],
      result: (row.result as string | null) ?? undefined,
      metadata: (row.metadata as TaskEntity["metadata"]) ?? createDefaultMetadata(),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  async create(input: CreateTaskInput): Promise<TaskEntity> {
    const task: TaskEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      title: input.title,
      objective: input.objective,
      status: input.status,
      result: input.result,
      metadata: input.metadata ?? createDefaultMetadata(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO tasks (
         id,
         workspace_id,
         agent_id,
         conversation_id,
         title,
         objective,
         status,
         result,
         metadata,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        task.id,
        task.workspaceId,
        task.agentId,
        task.conversationId ?? null,
        task.title,
        task.objective,
        task.status,
        task.result ?? null,
        JSON.stringify(task.metadata),
        task.createdAt,
        task.updatedAt
      ]
    );

    return task;
  }

  async updateState(id: string, input: UpdateTaskStateInput): Promise<void> {
    await this.pool.query(
      `UPDATE tasks
       SET status = COALESCE($2, status),
           result = COALESCE($3, result),
           metadata = COALESCE($4::jsonb, metadata),
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.status ?? null,
        input.result ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
  }

  async findById(id: string): Promise<TaskEntity | null> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, agent_id, conversation_id, title, objective, status, result, metadata, created_at, updated_at
       FROM tasks
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async findByIdInWorkspace(
    id: string,
    workspaceId: string
  ): Promise<TaskEntity | null> {
    const result = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.agent_id, t.conversation_id, t.title, t.objective, t.status, t.result, t.metadata, t.created_at, t.updated_at
       FROM tasks t
       WHERE t.id = $1 AND t.workspace_id = $2
       LIMIT 1`,
      [id, workspaceId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async listByWorkspaceId(workspaceId: string, limit = 20): Promise<TaskEntity[]> {
    const result = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.agent_id, t.conversation_id, t.title, t.objective, t.status, t.result, t.metadata, t.created_at, t.updated_at
       FROM tasks t
       WHERE t.workspace_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async listPenetrationTestsByWorkspace(
    workspaceId: string,
    limit = 20
  ): Promise<TaskEntity[]> {
    const result = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.agent_id, t.conversation_id, t.title, t.objective, t.status, t.result, t.metadata, t.created_at, t.updated_at
       FROM tasks t
       WHERE t.workspace_id = $1
         AND t.metadata ? 'penetrationTest'
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findPenetrationTestByRunId(
    workspaceId: string,
    runId: string
  ): Promise<TaskEntity | null> {
    const result = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.agent_id, t.conversation_id, t.title, t.objective, t.status, t.result, t.metadata, t.created_at, t.updated_at
       FROM tasks t
       WHERE t.workspace_id = $1
         AND t.metadata ? 'penetrationTest'
         AND t.metadata->'penetrationTest'->>'runId' = $2
       LIMIT 1`,
      [workspaceId, runId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async listByStatuses(
    statuses: TaskEntity["status"][],
    limit = 100
  ): Promise<TaskEntity[]> {
    if (statuses.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT id, workspace_id, agent_id, conversation_id, title, objective, status, result, metadata, created_at, updated_at
       FROM tasks
       WHERE status = ANY($1::text[])
       ORDER BY created_at ASC
       LIMIT $2`,
      [statuses, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async updateResult(
    id: string,
    status: TaskEntity["status"],
    result?: string,
    metadata?: TaskEntity["metadata"]
  ): Promise<void> {
    await this.updateState(id, {
      status,
      result,
      metadata
    });
  }

  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM tasks");
    return result.rows[0]?.count ?? 0;
  }
}
