import { BaseEntity } from "./base.entity";

export interface UserEntity extends BaseEntity {
  email: string;
  passwordHash: string;
  displayName: string;
  role: "user" | "admin";
  preferences: Record<string, unknown>;
  lastLoginAt?: string;
}
