import { AppError } from "../../utils/app-error";
import { BaseEmbeddingProvider } from "./base-embedding-provider";
import { EmbeddingVector } from "./embedding.types";

export class EmbeddingService {
  constructor(private readonly provider: BaseEmbeddingProvider) {}

  async embedDocuments(texts: string[]): Promise<EmbeddingVector[]> {
    const sanitized = texts.map((text) => text.trim());

    if (sanitized.length === 0 || sanitized.every((text) => text.length === 0)) {
      return [];
    }

    const vectors = await this.provider.embed(sanitized);
    if (vectors.length !== sanitized.length) {
      throw new AppError(
        "Embedding provider returned a mismatched number of vectors for the document chunks",
        502
      );
    }

    this.assertEmbeddingConsistency(vectors);
    return vectors;
  }

  async embedQuery(text: string): Promise<EmbeddingVector> {
    const [vector] = await this.provider.embed([text.trim()]);
    if (!vector) {
      throw new AppError("Embedding provider returned no vector for the query", 502);
    }

    return vector;
  }

  private assertEmbeddingConsistency(vectors: EmbeddingVector[]): void {
    if (vectors.length === 0) {
      return;
    }

    const baseline = vectors[0]!;
    const mismatch = vectors.find(
      (vector) =>
        vector.dimensions !== baseline.dimensions ||
        vector.model !== baseline.model ||
        vector.provider !== baseline.provider
    );

    if (mismatch) {
      throw new AppError(
        "Embedding provider returned inconsistent vector metadata across chunks",
        502
      );
    }
  }
}
