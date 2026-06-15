import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { TaskEntity } from "../entities/task.entity";

interface CreateTaskInput {
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: TaskEntity["status"];
}

export class TaskRepository extends BaseRepository {
  async create(input: CreateTaskInput): Promise<TaskEntity> {
    const task: TaskEntity = {
      id: randomUUID(),
      agentId: input.agentId,
      conversationId: input.conversationId,
      title: input.title,
      objective: input.objective,
      status: input.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO tasks (id, agent_id, conversation_id, title, objective, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        task.id,
        task.agentId,
        task.conversationId ?? null,
        task.title,
        task.objective,
        task.status,
        task.createdAt,
        task.updatedAt
      ]
    );

    return task;
  }

  async updateResult(
    id: string,
    status: TaskEntity["status"],
    result?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE tasks
       SET status = $2, result = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, status, result ?? null]
    );
  }

  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM tasks");
    return result.rows[0]?.count ?? 0;
  }
}
