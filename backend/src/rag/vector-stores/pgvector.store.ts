import { Pool } from "pg";

import {
  BaseVectorStore,
  VectorSearchOptions,
  VectorSearchResult
} from "../base-vector-store";

export class PgVectorStore extends BaseVectorStore {
  constructor(
    private readonly pool: Pool,
    private readonly dimension: number
  ) {
    super();
  }

  async insert(
    id: string,
    vector: number[],
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(`Expected vector of length ${this.dimension}`);
    }

    const fileId = metadata.fileId;
    if (typeof fileId !== "string") {
      throw new Error("metadata.fileId is required for pgvector inserts");
    }

    await this.pool.query(
      `INSERT INTO embeddings (id, file_id, chunk_index, content, vector, metadata, created_at, updated_at)
       VALUES ($1, $2, 0, $3, $4::vector, $5::jsonb, NOW(), NOW())`,
      [id, fileId, content, `[${vector.join(",")}]`, JSON.stringify(metadata)]
    );
  }

  async search(
    vector: number[],
    limit: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const clauses = ["vector_dims(e.vector) = $2"];
    const params: Array<string | number> = [`[${vector.join(",")}]`, options.dimensions ?? vector.length];

    if (options.embeddingModel) {
      params.push(options.embeddingModel);
      clauses.push(`e.metadata->>'embeddingModel' = $${params.length}`);
    }

    if (options.embeddingProvider) {
      params.push(options.embeddingProvider);
      clauses.push(`e.metadata->>'embeddingProvider' = $${params.length}`);
    }

    if (options.workspaceId) {
      params.push(options.workspaceId);
      clauses.push(`e.workspace_id = $${params.length}`);
    }

    if (typeof options.minScore === "number") {
      params.push(options.minScore);
      clauses.push(`1 - (e.vector <=> $1::vector) >= $${params.length}`);
    }

    params.push(limit);

    const result = await this.pool.query(
      `SELECT e.id,
              e.file_id,
              e.chunk_index,
              e.content,
              e.metadata,
              f.file_name,
              1 - (e.vector <=> $1::vector) AS score
       FROM embeddings e
       INNER JOIN files f ON f.id = e.file_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY e.vector <=> $1::vector
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      score: Number(row.score),
      metadata: {
        ...(row.metadata ?? {}),
        fileId: row.file_id,
        fileName: row.file_name,
        chunkIndex: row.chunk_index
      }
    }));
  }
}
