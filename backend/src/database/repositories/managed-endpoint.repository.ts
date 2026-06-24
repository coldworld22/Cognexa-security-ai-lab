import { randomUUID } from "crypto";

import {
  ManagedEndpointEntity
} from "../entities/managed-endpoint.entity";
import {
  EndpointRiskLevel,
  EndpointStatus,
  EndpointTelemetry
} from "../entities/monitored-endpoint.entity";
import { BaseRepository } from "./base.repository";

interface UpsertManagedEndpointInput {
  agentId: string;
  displayName: string;
  hostname: string;
  ipAddress: string;
  macAddress?: string;
  subnet?: string;
  operatingSystem: string;
  loggedInUser?: string;
  status: EndpointStatus;
  riskLevel: EndpointRiskLevel;
  lastSeenAt: string;
  telemetry: EndpointTelemetry;
  metadata?: Record<string, unknown>;
}

export class ManagedEndpointRepository extends BaseRepository {
  async listRecent(activeAfterIso: string): Promise<ManagedEndpointEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              agent_id,
              display_name,
              hostname,
              ip_address,
              mac_address,
              subnet,
              operating_system,
              logged_in_user,
              status,
              risk_level,
              last_seen_at,
              telemetry,
              metadata,
              created_at,
              updated_at
         FROM managed_endpoints
        WHERE last_seen_at >= $1::timestamptz
        ORDER BY last_seen_at DESC`,
      [activeAfterIso]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async upsertHeartbeat(input: UpsertManagedEndpointInput): Promise<ManagedEndpointEntity> {
    const result = await this.pool.query(
      `INSERT INTO managed_endpoints (
         id,
         agent_id,
         display_name,
         hostname,
         ip_address,
         mac_address,
         subnet,
         operating_system,
         logged_in_user,
         status,
         risk_level,
         last_seen_at,
         telemetry,
         metadata,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13::jsonb, $14::jsonb, NOW(), NOW()
       )
       ON CONFLICT (agent_id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         hostname = EXCLUDED.hostname,
         ip_address = EXCLUDED.ip_address,
         mac_address = EXCLUDED.mac_address,
         subnet = EXCLUDED.subnet,
         operating_system = EXCLUDED.operating_system,
         logged_in_user = EXCLUDED.logged_in_user,
         status = EXCLUDED.status,
         risk_level = EXCLUDED.risk_level,
         last_seen_at = EXCLUDED.last_seen_at,
         telemetry = EXCLUDED.telemetry,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id,
                 agent_id,
                 display_name,
                 hostname,
                 ip_address,
                 mac_address,
                 subnet,
                 operating_system,
                 logged_in_user,
                 status,
                 risk_level,
                 last_seen_at,
                 telemetry,
                 metadata,
                 created_at,
                 updated_at`,
      [
        randomUUID(),
        input.agentId,
        input.displayName,
        input.hostname,
        input.ipAddress,
        input.macAddress ?? null,
        input.subnet ?? null,
        input.operatingSystem,
        input.loggedInUser ?? null,
        input.status,
        input.riskLevel,
        input.lastSeenAt,
        JSON.stringify(input.telemetry),
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): ManagedEndpointEntity {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      displayName: row.display_name as string,
      hostname: row.hostname as string,
      ipAddress: row.ip_address as string,
      macAddress: (row.mac_address as string | null) ?? undefined,
      subnet: (row.subnet as string | null) ?? undefined,
      operatingSystem: row.operating_system as string,
      loggedInUser: (row.logged_in_user as string | null) ?? undefined,
      status: row.status as EndpointStatus,
      riskLevel: row.risk_level as EndpointRiskLevel,
      lastSeenAt:
        row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : (row.last_seen_at as string),
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
