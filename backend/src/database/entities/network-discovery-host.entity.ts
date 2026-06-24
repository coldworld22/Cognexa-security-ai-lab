import { BaseEntity } from "./base.entity";

export type NetworkDiscoveryStatus = "online" | "offline";
export type NetworkResolutionSource =
  | "dns"
  | "netbios"
  | "smb"
  | "mdns"
  | "fortigate"
  | "agent"
  | "unresolved";

export interface NetworkDiscoveryHostEntity extends BaseEntity {
  ipAddress: string;
  hostname: string;
  macAddress?: string;
  vendor?: string;
  subnet: string;
  interfaceAddress: string;
  status: NetworkDiscoveryStatus;
  resolutionSource: NetworkResolutionSource;
  resolutionCachedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
}
