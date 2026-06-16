import {
  BaseVectorStore,
  VectorSearchOptions,
  VectorSearchResult
} from "../base-vector-store";

export class QdrantVectorStore extends BaseVectorStore {
  private collectionReady = false;

  constructor(
    private readonly baseUrl: string,
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
    await this.ensureCollection(vector.length);

    await fetch(`${this.baseUrl}/collections/security-ai-lab/points`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        points: [
          {
            id,
            vector,
            payload: {
              content,
              ...metadata
            }
          }
        ]
      })
    }).catch(() => undefined);
  }

  async search(
    vector: number[],
    limit: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    await this.ensureCollection(options.dimensions ?? vector.length);

    const must: Array<Record<string, unknown>> = [];
    if (options.embeddingModel) {
      must.push({
        key: "embeddingModel",
        match: {
          value: options.embeddingModel
        }
      });
    }

    if (options.embeddingProvider) {
      must.push({
        key: "embeddingProvider",
        match: {
          value: options.embeddingProvider
        }
      });
    }

    if (options.workspaceId) {
      must.push({
        key: "workspaceId",
        match: {
          value: options.workspaceId
        }
      });
    }

    const response = await fetch(
      `${this.baseUrl}/collections/security-ai-lab/points/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vector,
          limit,
          filter: must.length > 0 ? { must } : undefined,
          score_threshold: options.minScore
        })
      }
    ).catch(() => null);

    if (!response || !response.ok) {
      return [
        {
          id: "qdrant-unavailable",
          content: `Qdrant search unavailable. Expected dimension ${this.dimension}.`,
          score: 0,
          metadata: {}
        }
      ];
    }

    const json = (await response.json()) as {
      result?: Array<{
        id: string;
        score: number;
        payload?: Record<string, unknown>;
      }>;
    };

    return (json.result ?? []).map((item) => ({
      id: String(item.id),
      content: String(item.payload?.content ?? ""),
      score: item.score,
      metadata: item.payload ?? {}
    }));
  }

  private async ensureCollection(dimension: number): Promise<void> {
    if (this.collectionReady) {
      return;
    }

    await fetch(`${this.baseUrl}/collections/security-ai-lab`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vectors: {
          size: dimension || this.dimension,
          distance: "Cosine"
        }
      })
    }).catch(() => undefined);

    this.collectionReady = true;
  }
}
