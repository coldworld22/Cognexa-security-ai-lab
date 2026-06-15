import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { ConversationEntity } from "../entities/conversation.entity";

interface CreateConversationInput {
  userId: string;
  title: string;
  modelProvider: string;
  modelName: string;
}

export class ConversationRepository extends BaseRepository {
  async create(input: CreateConversationInput): Promise<ConversationEntity> {
    const conversation: ConversationEntity = {
      id: randomUUID(),
      userId: input.userId,
      title: input.title,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO conversations (id, user_id, title, model_provider, model_name, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        conversation.id,
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

  async listByUser(userId: string): Promise<ConversationEntity[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, title, model_provider, model_name, metadata, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
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
      `SELECT id, user_id, title, model_provider, model_name, metadata, created_at, updated_at
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
      userId: row.user_id,
      title: row.title,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM conversations"
    );
    return result.rows[0]?.count ?? 0;
  }

  async touch(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [id]
    );
  }
}
