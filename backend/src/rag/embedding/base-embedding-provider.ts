import { EmbeddingVector } from "./embedding.types";

export abstract class BaseEmbeddingProvider {
  abstract readonly providerId: string;

  abstract embed(texts: string[]): Promise<EmbeddingVector[]>;
}
