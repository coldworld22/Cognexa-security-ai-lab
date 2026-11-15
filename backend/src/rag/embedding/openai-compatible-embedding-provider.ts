import { z } from "zod";

import { BaseEmbeddingProvider } from "./base-embedding-provider";
import { EmbeddingVector } from "./embedding.types";

interface OpenAICompatibleEmbeddingProviderOptions {
  baseUrl: string;
  providerId: string;
  defaultModel: string;
  /** Extra request headers, e.g. an API key for hosted endpoints. */
  headers?: Record<string, string>;
  /**
   * Ask the model for vectors of this size. Supported by OpenAI's text-embedding-3 models, which
   * lets them fit an existing pgvector column (e.g. 768) instead of their native 1536.
   */
  dimensions?: number;
}

export class OpenAICompatibleEmbeddingProvider extends BaseEmbeddingProvider {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly headers: Record<string, string>;
  private readonly dimensions?: number;

  constructor(options: OpenAICompatibleEmbeddingProviderOptions) {
    super();
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl;
    this.defaultModel = options.defaultModel;
    this.headers = { "Content-Type": "application/json", ...options.headers };
    this.dimensions = options.dimensions;
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model: this.defaultModel,
        input: texts,
        ...(this.dimensions ? { dimensions: this.dimensions } : {})
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
