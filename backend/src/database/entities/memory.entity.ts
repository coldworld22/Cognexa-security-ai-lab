import { BaseEntity } from "./base.entity";

export interface MemoryEntity extends BaseEntity {
  workspaceId: string;
  userId: string;
  memoryType: "short_term" | "long_term" | "preference";
  key: string;
  value: string;
  score: number;
}
