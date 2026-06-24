import { randomUUID } from "crypto";

import {
  EndpointRiskLevel,
  EndpointStatus,
  EndpointTelemetry,
  MonitoredEndpointEntity
} from "../entities/monitored-endpoint.entity";
import { BaseRepository } from "./base.repository";

interface CreateMonitoredEndpointInput {
  workspaceId: string;
  createdByUserId?: string;
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  operatingSystem: string;
  status: EndpointStatus;
  riskLevel: EndpointRiskLevel;
  lastSeenAt?: string;
  loggedInUser?: string;
  tags: string[];
  telemetry: EndpointTelemetry;
  metadata?: Record<string, unknown>;
}

interface UpdateMonitoredEndpointStatusInput {
  status: EndpointStatus;
  lastSeenAt?: string;
  telemetry: EndpointTelemetry;
  metadata: Record<string, unknown>;
}

export class MonitoredEndpointRepository extends BaseRepository {
  async listByWorkspace(workspaceId: string): Promise<MonitoredEndpointEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              created_by_user_id,
              display_name,
              hostname,
              ip_address,
              subnet,
              operating_system,
              status,
              risk_level,
              last_seen_at,
              logged_in_user,
              tags,
              telemetry,
              metadata,
              created_at,
              updated_at
         FROM monitored_endpoints
        WHERE workspace_id = $1
        ORDER BY
          CASE status
            WHEN 'online' THEN 0
            WHEN 'degraded' THEN 1
            ELSE 2
          END,
          CASE risk_level
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          COALESCE(last_seen_at, created_at) DESC`,
      [workspaceId]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByWorkspaceAndIpAddress(
    workspaceId: string,
    ipAddress: string
  ): Promise<MonitoredEndpointEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              created_by_user_id,
              display_name,
              hostname,
              ip_address,
              subnet,
              operating_system,
              status,
              risk_level,
              last_seen_at,
              logged_in_user,
              tags,
              telemetry,
              metadata,
              created_at,
              updated_at
         FROM monitored_endpoints
        WHERE workspace_id = $1
          AND ip_address = $2
        LIMIT 1`,
      [workspaceId, ipAddress]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async create(input: CreateMonitoredEndpointInput): Promise<MonitoredEndpointEntity> {
    const endpoint: MonitoredEndpointEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      displayName: input.displayName,
      hostname: input.hostname,
      ipAddress: input.ipAddress,
      subnet: input.subnet,
      operatingSystem: input.operatingSystem,
      status: input.status,
      riskLevel: input.riskLevel,
      lastSeenAt: input.lastSeenAt,
      loggedInUser: input.loggedInUser,
      tags: input.tags,
      telemetry: input.telemetry,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO monitored_endpoints (
         id,
         workspace_id,
         created_by_user_id,
         display_name,
         hostname,
         ip_address,
         subnet,
         operating_system,
         status,
         risk_level,
         last_seen_at,
         logged_in_user,
         tags,
         telemetry,
         metadata,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17
       )`,
      [
        endpoint.id,
        endpoint.workspaceId,
        endpoint.createdByUserId,
        endpoint.displayName,
        endpoint.hostname,
        endpoint.ipAddress,
        endpoint.subnet,
        endpoint.operatingSystem,
        endpoint.status,
        endpoint.riskLevel,
        endpoint.lastSeenAt ?? null,
        endpoint.loggedInUser ?? null,
        JSON.stringify(endpoint.tags),
        JSON.stringify(endpoint.telemetry),
        JSON.stringify(endpoint.metadata),
        endpoint.createdAt,
        endpoint.updatedAt
      ]
    );

    return endpoint;
  }

  async updateStatus(
    endpointId: string,
    input: UpdateMonitoredEndpointStatusInput
  ): Promise<MonitoredEndpointEntity> {
    const result = await this.pool.query(
      `UPDATE monitored_endpoints
          SET status = $2,
              last_seen_at = COALESCE($3, last_seen_at),
              telemetry = $4::jsonb,
              metadata = $5::jsonb,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                workspace_id,
                created_by_user_id,
                display_name,
                hostname,
                ip_address,
                subnet,
                operating_system,
                status,
                risk_level,
                last_seen_at,
                logged_in_user,
                tags,
                telemetry,
                metadata,
                created_at,
                updated_at`,
      [
        endpointId,
        input.status,
        input.lastSeenAt ?? null,
        JSON.stringify(input.telemetry),
        JSON.stringify(input.metadata)
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): MonitoredEndpointEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      createdByUserId: (row.created_by_user_id as string | null) ?? undefined,
      displayName: row.display_name as string,
      hostname: row.hostname as string,
      ipAddress: row.ip_address as string,
      subnet: row.subnet as string,
      operatingSystem: row.operating_system as string,
      status: row.status as EndpointStatus,
      riskLevel: row.risk_level as EndpointRiskLevel,
      lastSeenAt:
        row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : ((row.last_seen_at as string | null) ?? undefined),
      loggedInUser: (row.logged_in_user as string | null) ?? undefined,
      tags: (row.tags as string[]) ?? [],
      telemetry: ((row.telemetry as EndpointTelemetry | null) ?? {
        activeAlerts: 0
      }) as EndpointTelemetry,
      metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
