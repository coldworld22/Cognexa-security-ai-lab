import { PrivateModeConfigEntity } from "../entities/private-mode-config.entity";
import { BaseRepository } from "./base.repository";

export class PrivateModeConfigRepository extends BaseRepository {
  async findByWorkspaceId(
    workspaceId: string
  ): Promise<PrivateModeConfigEntity | null> {
    const result = await this.pool.query(
      `SELECT workspace_id,
              mode,
              outbound_strategy,
              vpn_relays,
              tor_control_port,
              tor_socks_port,
              dns_over_tor,
              exit_geography_preference,
              circuit_rotation_interval,
              tls_fingerprint_profile,
              request_timing_jitter,
              enabled_categories,
              created_at,
              updated_at
         FROM private_mode_configs
        WHERE workspace_id = $1
        LIMIT 1`,
      [workspaceId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async upsert(entity: PrivateModeConfigEntity): Promise<PrivateModeConfigEntity> {
    const result = await this.pool.query(
      `INSERT INTO private_mode_configs (
         workspace_id,
         mode,
         outbound_strategy,
         vpn_relays,
         tor_control_port,
         tor_socks_port,
         dns_over_tor,
         exit_geography_preference,
         circuit_rotation_interval,
         tls_fingerprint_profile,
         request_timing_jitter,
         enabled_categories,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14
       )
       ON CONFLICT (workspace_id) DO UPDATE
         SET mode = EXCLUDED.mode,
             outbound_strategy = EXCLUDED.outbound_strategy,
             vpn_relays = EXCLUDED.vpn_relays,
             tor_control_port = EXCLUDED.tor_control_port,
             tor_socks_port = EXCLUDED.tor_socks_port,
             dns_over_tor = EXCLUDED.dns_over_tor,
             exit_geography_preference = EXCLUDED.exit_geography_preference,
             circuit_rotation_interval = EXCLUDED.circuit_rotation_interval,
             tls_fingerprint_profile = EXCLUDED.tls_fingerprint_profile,
             request_timing_jitter = EXCLUDED.request_timing_jitter,
             enabled_categories = EXCLUDED.enabled_categories,
             updated_at = EXCLUDED.updated_at
       RETURNING workspace_id,
                 mode,
                 outbound_strategy,
                 vpn_relays,
                 tor_control_port,
                 tor_socks_port,
                 dns_over_tor,
                 exit_geography_preference,
                 circuit_rotation_interval,
                 tls_fingerprint_profile,
                 request_timing_jitter,
                 enabled_categories,
                 created_at,
                 updated_at`,
      [
        entity.workspaceId,
        entity.mode,
        entity.outboundStrategy,
        JSON.stringify(entity.vpnRelays),
        entity.torControlPort,
        entity.torSocksPort,
        entity.dnsOverTor,
        JSON.stringify(entity.exitGeographyPreference),
        entity.circuitRotationInterval,
        entity.tlsFingerprintProfile,
        entity.requestTimingJitter,
        JSON.stringify(entity.enabledCategories),
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): PrivateModeConfigEntity {
    return {
      workspaceId: row.workspace_id as string,
      id: row.workspace_id as string,
      mode: row.mode as PrivateModeConfigEntity["mode"],
      outboundStrategy:
        row.outbound_strategy as PrivateModeConfigEntity["outboundStrategy"],
      vpnRelays:
        ((row.vpn_relays as PrivateModeConfigEntity["vpnRelays"] | null) ?? []),
      torControlPort: Number(row.tor_control_port),
      torSocksPort: Number(row.tor_socks_port),
      dnsOverTor: Boolean(row.dns_over_tor),
      exitGeographyPreference:
        ((row.exit_geography_preference as string[] | null) ?? []),
      circuitRotationInterval: Number(row.circuit_rotation_interval),
      tlsFingerprintProfile:
        row.tls_fingerprint_profile as PrivateModeConfigEntity["tlsFingerprintProfile"],
      requestTimingJitter: Number(row.request_timing_jitter),
      enabledCategories:
        ((row.enabled_categories as PrivateModeConfigEntity["enabledCategories"] | null) ??
          []),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
