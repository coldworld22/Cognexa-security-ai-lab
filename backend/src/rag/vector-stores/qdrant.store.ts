import { BaseVectorStore, VectorSearchResult } from "../base-vector-store";

export class QdrantVectorStore extends BaseVectorStore {
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

  async search(vector: number[], limit: number): Promise<VectorSearchResult[]> {
    const response = await fetch(
      `${this.baseUrl}/collections/security-ai-lab/points/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vector,
          limit
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
}
