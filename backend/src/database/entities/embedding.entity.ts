import { BaseEntity } from "./base.entity";

export interface EmbeddingEntity extends BaseEntity {
  fileId: string;
  chunkIndex: number;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
}
