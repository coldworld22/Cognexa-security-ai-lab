import { BaseRepository } from "./base.repository";

interface CreateEmbeddingInput {
  workspaceId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export class EmbeddingRepository extends BaseRepository {
  async insertMany(chunks: CreateEmbeddingInput[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    for (const chunk of chunks) {
      await this.pool.query(
        `INSERT INTO embeddings (
           id,
           workspace_id,
           file_id,
           chunk_index,
           content,
           vector,
           metadata,
           created_at,
           updated_at
         )
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, $6::jsonb, NOW(), NOW())`,
        [
          chunk.workspaceId,
          chunk.fileId,
          chunk.chunkIndex,
          chunk.content,
          `[${chunk.vector.join(",")}]`,
          JSON.stringify(chunk.metadata ?? {})
        ]
      );
    }
  }
}
