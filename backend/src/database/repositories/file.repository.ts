import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { FileEntity } from "../entities/file.entity";

interface CreateFileInput {
  workspaceId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  path: string;
  sizeBytes: number;
}

export class FileRepository extends BaseRepository {
  async create(input: CreateFileInput): Promise<FileEntity> {
    const entity: FileEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      path: input.path,
      sizeBytes: input.sizeBytes,
      status: "uploaded",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO files (
         id,
         workspace_id,
         user_id,
         file_name,
         mime_type,
         path,
         size_bytes,
         status,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entity.id,
        entity.workspaceId,
        entity.userId,
        entity.fileName,
        entity.mimeType,
        entity.path,
        entity.sizeBytes,
        entity.status,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async updateStatus(id: string, status: FileEntity["status"]): Promise<void> {
    await this.pool.query(
      "UPDATE files SET status = $2, updated_at = NOW() WHERE id = $1",
      [id, status]
    );
  }

  async getSummary(): Promise<{
    total: number;
    indexed: number;
    uploaded: number;
    failed: number;
    indexedToday: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'indexed')::int AS indexed,
         COUNT(*) FILTER (WHERE status = 'uploaded')::int AS uploaded,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (
           WHERE status = 'indexed' AND updated_at >= NOW() - INTERVAL '1 day'
         )::int AS indexed_today
       FROM files`
    );

    const row = result.rows[0];

    return {
      total: row?.total ?? 0,
      indexed: row?.indexed ?? 0,
      uploaded: row?.uploaded ?? 0,
      failed: row?.failed ?? 0,
      indexedToday: row?.indexed_today ?? 0
    };
  }
}
