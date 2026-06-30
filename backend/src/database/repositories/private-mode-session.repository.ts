import { randomUUID } from "crypto";

import { PrivateModeSessionEntity } from "../entities/private-mode-session.entity";
import { BaseRepository } from "./base.repository";

interface CreatePrivateModeSessionInput {
  workspaceId: string;
  strategy: PrivateModeSessionEntity["strategy"];
  exitNodes?: string[];
  circuitIds?: string[];
  startedAt: string;
}

export class PrivateModeSessionRepository extends BaseRepository {
  async create(
    input: CreatePrivateModeSessionInput
  ): Promise<PrivateModeSessionEntity> {
    const entity: PrivateModeSessionEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      strategy: input.strategy,
      exitNodes: input.exitNodes ?? [],
      circuitIds: input.circuitIds ?? [],
      startedAt: input.startedAt,
      createdAt: input.startedAt,
      updatedAt: input.startedAt
    };

    await this.pool.query(
      `INSERT INTO private_mode_sessions (
         id,
         workspace_id,
         strategy,
         exit_nodes,
         circuit_ids,
         started_at,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        entity.id,
        entity.workspaceId,
        entity.strategy,
        JSON.stringify(entity.exitNodes),
        JSON.stringify(entity.circuitIds),
        entity.startedAt,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async findActiveByWorkspaceId(
    workspaceId: string
  ): Promise<PrivateModeSessionEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              strategy,
              exit_nodes,
              circuit_ids,
              started_at,
              ended_at,
              created_at,
              updated_at
         FROM private_mode_sessions
        WHERE workspace_id = $1
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      [workspaceId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<PrivateModeSessionEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              strategy,
              exit_nodes,
              circuit_ids,
              started_at,
              ended_at,
              created_at,
              updated_at
         FROM private_mode_sessions
        WHERE id = $1
        LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async updateRuntime(
    sessionId: string,
    input: {
      exitNodes?: string[];
      circuitIds?: string[];
    }
  ): Promise<PrivateModeSessionEntity> {
    const result = await this.pool.query(
      `UPDATE private_mode_sessions
          SET exit_nodes = COALESCE($2::jsonb, exit_nodes),
              circuit_ids = COALESCE($3::jsonb, circuit_ids),
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                workspace_id,
                strategy,
                exit_nodes,
                circuit_ids,
                started_at,
                ended_at,
                created_at,
                updated_at`,
      [
        sessionId,
        input.exitNodes ? JSON.stringify(input.exitNodes) : null,
        input.circuitIds ? JSON.stringify(input.circuitIds) : null
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async endSession(
    sessionId: string,
    endedAt: string
  ): Promise<PrivateModeSessionEntity> {
    const result = await this.pool.query(
      `UPDATE private_mode_sessions
          SET ended_at = $2,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                workspace_id,
                strategy,
                exit_nodes,
                circuit_ids,
                started_at,
                ended_at,
                created_at,
                updated_at`,
      [sessionId, endedAt]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): PrivateModeSessionEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      strategy: row.strategy as PrivateModeSessionEntity["strategy"],
      exitNodes: ((row.exit_nodes as string[] | null) ?? []),
      circuitIds: ((row.circuit_ids as string[] | null) ?? []),
      startedAt:
        row.started_at instanceof Date
          ? row.started_at.toISOString()
          : (row.started_at as string),
      endedAt:
        row.ended_at instanceof Date
          ? row.ended_at.toISOString()
          : ((row.ended_at as string | null) ?? undefined),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
