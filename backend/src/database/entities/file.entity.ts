import { BaseEntity } from "./base.entity";

export interface FileEntity extends BaseEntity {
  workspaceId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  path: string;
  sizeBytes: number;
  status: "uploaded" | "indexed" | "failed";
}
