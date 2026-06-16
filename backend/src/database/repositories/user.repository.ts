import { BaseRepository } from "./base.repository";
import { UserEntity } from "../entities/user.entity";
import { CanonicalUserRole } from "../../authorization/authorization.types";
import { randomUUID } from "crypto";

interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  role?: UserEntity["role"];
  currentWorkspaceId?: string;
}

export class UserRepository extends BaseRepository {
  async create(input: CreateUserInput): Promise<UserEntity> {
    const user: UserEntity = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: input.role ?? "developer",
      preferences: {},
      currentWorkspaceId: input.currentWorkspaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO users (
         id,
         email,
         display_name,
         password_hash,
         role,
         preferences,
         current_workspace_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        user.id,
        user.email,
        user.displayName,
        user.passwordHash,
        user.role,
        JSON.stringify(user.preferences),
        user.currentWorkspaceId ?? null,
        user.createdAt,
        user.updatedAt
      ]
    );

    return user;
  }

  async upsert(input: CreateUserInput): Promise<UserEntity> {
    const existingUser = await this.findByEmail(input.email);
    if (!existingUser) {
      return this.create(input);
    }

    await this.pool.query(
      `UPDATE users
       SET display_name = $2,
           password_hash = $3,
           role = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        existingUser.id,
        input.displayName,
        input.passwordHash,
        input.role ?? existingUser.role
      ]
    );

    return {
      ...existingUser,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: input.role ?? existingUser.role,
      updatedAt: new Date().toISOString()
    };
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at
             , current_workspace_id
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
      currentWorkspaceId: row.current_workspace_id ?? undefined,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async findById(id: string): Promise<UserEntity | null> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at
             , current_workspace_id
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
      currentWorkspaceId: row.current_workspace_id ?? undefined,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET last_login_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async listUsers(limit = 50): Promise<UserEntity[]> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at,
              current_workspace_id
       FROM users
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      role: row.role,
      preferences: row.preferences ?? {},
      currentWorkspaceId: row.current_workspace_id ?? undefined,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async updateRole(id: string, role: CanonicalUserRole): Promise<UserEntity> {
    const result = await this.pool.query(
      `UPDATE users
       SET role = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, password_hash, role, preferences, created_at, updated_at, last_login_at, current_workspace_id`,
      [id, role]
    );

    if (result.rowCount === 0) {
      throw new Error(`User ${id} not found`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      role: row.role,
      preferences: row.preferences ?? {},
      currentWorkspaceId: row.current_workspace_id ?? undefined,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async updateCurrentWorkspace(id: string, workspaceId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET current_workspace_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, workspaceId]
    );
  }

  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM users");
    return result.rows[0]?.count ?? 0;
  }
}
