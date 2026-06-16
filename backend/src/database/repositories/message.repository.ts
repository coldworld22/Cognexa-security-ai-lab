import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { MessageEntity, MessageRole } from "../entities/message.entity";

interface CreateMessageInput {
  workspaceId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export class MessageRepository extends BaseRepository {
  async create(input: CreateMessageInput): Promise<MessageEntity> {
    const message: MessageEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolName: input.toolName,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO messages (
         id,
         workspace_id,
         conversation_id,
         role,
         content,
         tool_name,
         metadata,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        message.id,
        message.workspaceId,
        message.conversationId,
        message.role,
        message.content,
        message.toolName ?? null,
        JSON.stringify(message.metadata),
        message.createdAt,
        message.updatedAt
      ]
    );

    return message;
  }

  async listByConversation(conversationId: string): Promise<MessageEntity[]> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, conversation_id, role, content, tool_name, metadata, created_at, updated_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      toolName: row.tool_name ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async listRecentByWorkspaceAndUser(
    workspaceId: string,
    userId: string,
    limit = 10
  ): Promise<MessageEntity[]> {
    const result = await this.pool.query(
      `SELECT m.id, m.workspace_id, m.conversation_id, m.role, m.content, m.tool_name, m.metadata, m.created_at, m.updated_at
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE c.workspace_id = $1
         AND c.user_id = $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [workspaceId, userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      toolName: row.tool_name ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM messages");
    return result.rows[0]?.count ?? 0;
  }
}
