import { Pool } from "pg";

import { BaseVectorStore, VectorSearchResult } from "../base-vector-store";

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

  async search(vector: number[], limit: number): Promise<VectorSearchResult[]> {
    const result = await this.pool.query(
      `SELECT id, content, metadata, 1 - (vector <=> $1::vector) AS score
       FROM embeddings
       ORDER BY vector <=> $1::vector
       LIMIT $2`,
      [`[${vector.join(",")}]`, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      score: Number(row.score),
      metadata: row.metadata ?? {}
    }));
  }
}
