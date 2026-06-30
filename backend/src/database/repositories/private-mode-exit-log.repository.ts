import { randomUUID } from "crypto";

import { PrivateModeExitLogEntity } from "../entities/private-mode-exit-log.entity";
import { BaseRepository } from "./base.repository";

interface CreatePrivateModeExitLogInput {
  sessionId: string;
  workspaceId: string;
  exitIp: string;
  exitRegion: string;
  targetHost: string;
  requestType: string;
  timestamp: string;
}

export class PrivateModeExitLogRepository extends BaseRepository {
  async create(
    input: CreatePrivateModeExitLogInput
  ): Promise<PrivateModeExitLogEntity> {
    const entity: PrivateModeExitLogEntity = {
      id: randomUUID(),
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      exitIp: input.exitIp,
      exitRegion: input.exitRegion,
      targetHost: input.targetHost,
      requestType: input.requestType,
      timestamp: input.timestamp,
      createdAt: input.timestamp,
      updatedAt: input.timestamp
    };

    await this.pool.query(
      `INSERT INTO private_mode_exit_logs (
         id,
         session_id,
         workspace_id,
         exit_ip,
         exit_region,
         target_host,
         request_type,
         timestamp,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entity.id,
        entity.sessionId,
        entity.workspaceId,
        entity.exitIp,
        entity.exitRegion,
        entity.targetHost,
        entity.requestType,
        entity.timestamp,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async listByWorkspace(
    workspaceId: string,
    limit = 50
  ): Promise<PrivateModeExitLogEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              session_id,
              workspace_id,
              exit_ip,
              exit_region,
              target_host,
              request_type,
              timestamp,
              created_at,
              updated_at
         FROM private_mode_exit_logs
        WHERE workspace_id = $1
        ORDER BY timestamp DESC
        LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): PrivateModeExitLogEntity {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      workspaceId: row.workspace_id as string,
      exitIp: row.exit_ip as string,
      exitRegion: row.exit_region as string,
      targetHost: row.target_host as string,
      requestType: row.request_type as string,
      timestamp:
        row.timestamp instanceof Date
          ? row.timestamp.toISOString()
          : (row.timestamp as string),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
