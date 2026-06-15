import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { FileEntity } from "../entities/file.entity";

interface CreateFileInput {
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
      `INSERT INTO files (id, user_id, file_name, mime_type, path, size_bytes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entity.id,
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
}
