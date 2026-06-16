export interface EmbeddingVector {
  vector: number[];
  dimensions: number;
  model: string;
  provider: string;
}
