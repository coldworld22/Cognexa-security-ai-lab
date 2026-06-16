import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { AgentEntity } from "../entities/agent.entity";

interface CreateAgentInput {
  workspaceId: string;
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
}

export class AgentRepository extends BaseRepository {
  async findById(id: string): Promise<AgentEntity | null> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, user_id, name, description, instructions, enabled_tools, created_at, updated_at
       FROM agents
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      enabledTools: row.enabled_tools ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async create(input: CreateAgentInput): Promise<AgentEntity> {
    const agent: AgentEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      enabledTools: input.enabledTools,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO agents (
         id,
         workspace_id,
         user_id,
         name,
         description,
         instructions,
         enabled_tools,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        agent.id,
        agent.workspaceId,
        agent.userId,
        agent.name,
        agent.description,
        agent.instructions,
        JSON.stringify(agent.enabledTools),
        agent.createdAt,
        agent.updatedAt
      ]
    );

    return agent;
  }
}
