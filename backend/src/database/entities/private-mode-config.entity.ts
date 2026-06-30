import { BaseEntity } from "./base.entity";
import {
  CloakingConfig,
  PrivateModeOutboundStrategy,
  PrivateModeState,
  RelayNode,
  TlsFingerprintProfile
} from "../../services/private-mode/private-mode.types";
import { PolicyCategory } from "../../policy/policy.types";

export interface PrivateModeConfigEntity extends BaseEntity {
  workspaceId: string;
  mode: PrivateModeState;
  outboundStrategy: PrivateModeOutboundStrategy;
  vpnRelays: RelayNode[];
  torControlPort: number;
  torSocksPort: number;
  dnsOverTor: boolean;
  exitGeographyPreference: string[];
  circuitRotationInterval: number;
  tlsFingerprintProfile: TlsFingerprintProfile;
  requestTimingJitter: number;
  enabledCategories: PolicyCategory[];
}

export function toCloakingConfig(
  entity: PrivateModeConfigEntity
): CloakingConfig {
  return {
    workspaceId: entity.workspaceId,
    mode: entity.mode,
    outboundStrategy: entity.outboundStrategy,
    vpnRelays: entity.vpnRelays,
    torControlPort: entity.torControlPort,
    torSocksPort: entity.torSocksPort,
    dnsOverTor: entity.dnsOverTor,
    exitGeographyPreference: entity.exitGeographyPreference,
    circuitRotationInterval: entity.circuitRotationInterval,
    tlsFingerprintProfile: entity.tlsFingerprintProfile,
    requestTimingJitter: entity.requestTimingJitter,
    enabledCategories: entity.enabledCategories,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}
