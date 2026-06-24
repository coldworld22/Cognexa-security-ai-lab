import { randomUUID } from "crypto";

import {
  NetworkDiscoveryHostEntity,
  NetworkDiscoveryStatus,
  NetworkResolutionSource
} from "../entities/network-discovery-host.entity";
import { BaseRepository } from "./base.repository";

interface UpsertNetworkDiscoveryHostInput {
  ipAddress: string;
  hostname: string;
  macAddress?: string | null;
  vendor?: string | null;
  subnet: string;
  interfaceAddress: string;
  status: NetworkDiscoveryStatus;
  resolutionSource: NetworkResolutionSource;
  resolutionCachedAt?: string | null;
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
}

export class NetworkDiscoveryHostRepository extends BaseRepository {
  async listAll(): Promise<NetworkDiscoveryHostEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              ip_address,
              hostname,
              mac_address,
              vendor,
              subnet,
              interface_address,
              status,
              resolution_source,
              resolution_cached_at,
              first_seen_at,
              last_seen_at,
              metadata,
              created_at,
              updated_at
         FROM network_discovery_hosts
        ORDER BY
          CASE status
            WHEN 'online' THEN 0
            ELSE 1
          END,
          last_seen_at DESC,
          ip_address ASC`
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByIpAddress(ipAddress: string): Promise<NetworkDiscoveryHostEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              ip_address,
              hostname,
              mac_address,
              vendor,
              subnet,
              interface_address,
              status,
              resolution_source,
              resolution_cached_at,
              first_seen_at,
              last_seen_at,
              metadata,
              created_at,
              updated_at
         FROM network_discovery_hosts
        WHERE ip_address = $1
        LIMIT 1`,
      [ipAddress]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async upsert(input: UpsertNetworkDiscoveryHostInput): Promise<NetworkDiscoveryHostEntity> {
    const result = await this.pool.query(
      `INSERT INTO network_discovery_hosts (
         id,
         ip_address,
         hostname,
         mac_address,
         vendor,
         subnet,
         interface_address,
         status,
         resolution_source,
         resolution_cached_at,
         first_seen_at,
         last_seen_at,
         metadata,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW(), NOW()
       )
       ON CONFLICT (ip_address)
       DO UPDATE SET
         hostname = EXCLUDED.hostname,
         mac_address = COALESCE(EXCLUDED.mac_address, network_discovery_hosts.mac_address),
         vendor = COALESCE(EXCLUDED.vendor, network_discovery_hosts.vendor),
         subnet = EXCLUDED.subnet,
         interface_address = EXCLUDED.interface_address,
         status = EXCLUDED.status,
         resolution_source = EXCLUDED.resolution_source,
         resolution_cached_at = EXCLUDED.resolution_cached_at,
         last_seen_at = EXCLUDED.last_seen_at,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id,
                 ip_address,
                 hostname,
                 mac_address,
                 vendor,
                 subnet,
                 interface_address,
                 status,
                 resolution_source,
                 resolution_cached_at,
                 first_seen_at,
                 last_seen_at,
                 metadata,
                 created_at,
                 updated_at`,
      [
        randomUUID(),
        input.ipAddress,
        input.hostname,
        input.macAddress ?? null,
        input.vendor ?? null,
        input.subnet,
        input.interfaceAddress,
        input.status,
        input.resolutionSource,
        input.resolutionCachedAt ?? null,
        input.lastSeenAt,
        input.lastSeenAt,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async markMissingOffline(
    scannedSubnets: string[],
    seenIpAddresses: string[],
    updatedAt: string
  ): Promise<void> {
    if (scannedSubnets.length === 0) {
      return;
    }

    await this.pool.query(
      `UPDATE network_discovery_hosts
          SET status = 'offline',
              updated_at = NOW()
        WHERE subnet = ANY($1::text[])
          AND NOT (ip_address = ANY($2::text[]))
          AND status <> 'offline'`,
      [scannedSubnets, seenIpAddresses.length > 0 ? seenIpAddresses : ["0.0.0.0"]]
    );

    await this.pool.query(
      `UPDATE network_discovery_hosts
          SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{lastOfflineMarkedAt}',
                to_jsonb($2::text),
                true
              )
        WHERE subnet = ANY($1::text[])
          AND NOT (ip_address = ANY($3::text[]))`,
      [
        scannedSubnets,
        updatedAt,
        seenIpAddresses.length > 0 ? seenIpAddresses : ["0.0.0.0"]
      ]
    );
  }

  private mapRow(row: Record<string, unknown>): NetworkDiscoveryHostEntity {
    return {
      id: row.id as string,
      ipAddress: row.ip_address as string,
      hostname: row.hostname as string,
      macAddress: (row.mac_address as string | null) ?? undefined,
      vendor: (row.vendor as string | null) ?? undefined,
      subnet: row.subnet as string,
      interfaceAddress: row.interface_address as string,
      status: row.status as NetworkDiscoveryStatus,
      resolutionSource: row.resolution_source as NetworkResolutionSource,
      resolutionCachedAt:
        row.resolution_cached_at instanceof Date
          ? row.resolution_cached_at.toISOString()
          : ((row.resolution_cached_at as string | null) ?? undefined),
      firstSeenAt:
        row.first_seen_at instanceof Date
          ? row.first_seen_at.toISOString()
          : (row.first_seen_at as string),
      lastSeenAt:
        row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : (row.last_seen_at as string),
      metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
