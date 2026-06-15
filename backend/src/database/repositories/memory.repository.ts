import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { MemoryEntity } from "../entities/memory.entity";

interface UpsertMemoryInput {
  userId: string;
  memoryType: MemoryEntity["memoryType"];
  key: string;
  value: string;
  score?: number;
}

export class MemoryRepository extends BaseRepository {
  async upsert(input: UpsertMemoryInput): Promise<MemoryEntity> {
    const entity: MemoryEntity = {
      id: randomUUID(),
      userId: input.userId,
      memoryType: input.memoryType,
      key: input.key,
      value: input.value,
      score: input.score ?? 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO memories (id, user_id, memory_type, key, value, score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, memory_type, key)
       DO UPDATE SET value = EXCLUDED.value, score = EXCLUDED.score, updated_at = EXCLUDED.updated_at`,
      [
        entity.id,
        entity.userId,
        entity.memoryType,
        entity.key,
        entity.value,
        entity.score,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async listByUser(userId: string): Promise<MemoryEntity[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, memory_type, key, value, score, created_at, updated_at
       FROM memories
       WHERE user_id = $1
       ORDER BY score DESC, updated_at DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      memoryType: row.memory_type,
      key: row.key,
      value: row.value,
      score: Number(row.score),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }
}
