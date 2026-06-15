import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { AgentEntity } from "../entities/agent.entity";

interface CreateAgentInput {
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
}

export class AgentRepository extends BaseRepository {
  async create(input: CreateAgentInput): Promise<AgentEntity> {
    const agent: AgentEntity = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      enabledTools: input.enabledTools,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO agents (id, user_id, name, description, instructions, enabled_tools, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        agent.id,
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
