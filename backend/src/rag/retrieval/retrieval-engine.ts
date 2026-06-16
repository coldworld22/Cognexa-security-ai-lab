import { BaseVectorStore } from "../base-vector-store";
import { EmbeddingVector } from "../embedding/embedding.types";

export interface RetrievalSearchOptions {
  limit?: number;
  workspaceId?: string;
  minScore?: number;
}

export class RetrievalEngine {
  constructor(private readonly vectorStore: BaseVectorStore) {}

  async search(
    queryEmbedding: EmbeddingVector,
    options: RetrievalSearchOptions = {}
  ) {
    return this.vectorStore.search(queryEmbedding.vector, options.limit ?? 5, {
      dimensions: queryEmbedding.dimensions,
      embeddingModel: queryEmbedding.model,
      embeddingProvider: queryEmbedding.provider,
      workspaceId: options.workspaceId,
      minScore: options.minScore
    });
  }
}
