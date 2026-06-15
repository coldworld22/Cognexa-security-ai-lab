import { BaseEntity } from "./base.entity";

export interface FileEntity extends BaseEntity {
  userId: string;
  fileName: string;
  mimeType: string;
  path: string;
  sizeBytes: number;
  status: "uploaded" | "indexed" | "failed";
}
