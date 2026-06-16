import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { ConversationEntity } from "../entities/conversation.entity";

interface CreateConversationInput {
  workspaceId: string;
  userId: string;
  title: string;
  modelProvider: string;
  modelName: string;
}

export class ConversationRepository extends BaseRepository {
  async create(input: CreateConversationInput): Promise<ConversationEntity> {
    const conversation: ConversationEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO conversations (
         id,
         workspace_id,
         user_id,
         title,
         model_provider,
         model_name,
         metadata,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        conversation.id,
        conversation.workspaceId,
        conversation.userId,
        conversation.title,
        conversation.modelProvider,
        conversation.modelName,
        JSON.stringify(conversation.metadata),
        conversation.createdAt,
        conversation.updatedAt
      ]
    );

    return conversation;
  }

  async listByWorkspace(workspaceId: string): Promise<ConversationEntity[]> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, user_id, title, model_provider, model_name, metadata, created_at, updated_at
       FROM conversations
       WHERE workspace_id = $1
       ORDER BY updated_at DESC`,
      [workspaceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      title: row.title,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async findById(id: string): Promise<ConversationEntity | null> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, user_id, title, model_provider, model_name, metadata, created_at, updated_at
       FROM conversations
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
      title: row.title,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async deleteById(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM conversations
       WHERE id = $1 AND workspace_id = $2
       RETURNING id`,
      [id, workspaceId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM conversations"
    );
    return result.rows[0]?.count ?? 0;
  }

  async countCreatedSince(interval: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM conversations
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    );
    return result.rows[0]?.count ?? 0;
  }

  async getUsageByProvider(): Promise<
    {
      provider: string;
      conversations: number;
    }[]
  > {
    const result = await this.pool.query(
      `SELECT model_provider AS provider, COUNT(*)::int AS conversations
       FROM conversations
       GROUP BY model_provider
       ORDER BY conversations DESC, provider ASC`
    );

    return result.rows.map((row) => ({
      provider: row.provider as string,
      conversations: row.conversations as number
    }));
  }

  async touch(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [id]
    );
  }
}
