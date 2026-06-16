export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  dimensions?: number;
  embeddingModel?: string;
  embeddingProvider?: string;
  workspaceId?: string;
  minScore?: number;
}

export abstract class BaseVectorStore {
  abstract insert(
    id: string,
    vector: number[],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  abstract search(
    vector: number[],
    limit: number,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;
}
