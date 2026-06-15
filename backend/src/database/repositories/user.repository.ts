import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { UserEntity } from "../entities/user.entity";

interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
}

export class UserRepository extends BaseRepository {
  async create(input: CreateUserInput): Promise<UserEntity> {
    const user: UserEntity = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: "user",
      preferences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO users (id, email, display_name, password_hash, role, preferences, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        user.id,
        user.email,
        user.displayName,
        user.passwordHash,
        user.role,
        JSON.stringify(user.preferences),
        user.createdAt,
        user.updatedAt
      ]
    );

    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      role: row.role,
      preferences: row.preferences ?? {},
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async findById(id: string): Promise<UserEntity | null> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      role: row.role,
      preferences: row.preferences ?? {},
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM users");
    return result.rows[0]?.count ?? 0;
  }
}
