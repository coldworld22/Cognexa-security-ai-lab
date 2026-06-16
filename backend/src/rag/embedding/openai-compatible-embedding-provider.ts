import { z } from "zod";

import { BaseEmbeddingProvider } from "./base-embedding-provider";
import { EmbeddingVector } from "./embedding.types";

interface OpenAICompatibleEmbeddingProviderOptions {
  baseUrl: string;
  providerId: string;
  defaultModel: string;
}

export class OpenAICompatibleEmbeddingProvider extends BaseEmbeddingProvider {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: OpenAICompatibleEmbeddingProviderOptions) {
    super();
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl;
    this.defaultModel = options.defaultModel;
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.defaultModel,
        input: texts
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding provider returned ${response.status}`);
    }

    const json = z
      .object({
        data: z.array(
          z.object({
            embedding: z.array(z.number()),
            index: z.number().optional()
          })
        ),
        model: z.string().optional()
      })
      .parse(await response.json());

    return json.data.map((item) => ({
      vector: item.embedding,
      dimensions: item.embedding.length,
      model: json.model ?? this.defaultModel,
      provider: this.providerId
    }));
  }
}
