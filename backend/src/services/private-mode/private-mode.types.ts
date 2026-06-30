import { PolicyCategory } from "../../policy/policy.types";

export const PRIVATE_MODE_STATES = ["direct", "cloaked"] as const;
export const PRIVATE_MODE_OUTBOUND_STRATEGIES = [
  "tor",
  "vpn-chain",
  "hybrid",
  "rotating-proxy"
] as const;
export const TLS_FINGERPRINT_PROFILES = [
  "browser",
  "curl",
  "random"
] as const;

export type PrivateModeState = (typeof PRIVATE_MODE_STATES)[number];
export type PrivateModeOutboundStrategy =
  (typeof PRIVATE_MODE_OUTBOUND_STRATEGIES)[number];
export type TlsFingerprintProfile = (typeof TLS_FINGERPRINT_PROFILES)[number];

export interface RelayNode {
  id: string;
  name: string;
  host: string;
  port: number;
  publicKey: string;
  region: string;
  provider: string;
  status: "online" | "offline" | "unknown";
  lastCheckedAt?: string;
}

export interface CloakingConfig {
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
  createdAt?: string;
  updatedAt?: string;
}

export interface CloakingSession {
  id: string;
  workspaceId: string;
  strategy: PrivateModeOutboundStrategy;
  exitNodes: string[];
  circuitIds: string[];
  startedAt: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExitLog {
  id: string;
  sessionId: string;
  workspaceId: string;
  exitIp: string;
  exitRegion: string;
  targetHost: string;
  requestType: string;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConnectionIdentity {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
  organization: string | null;
  asn: string | null;
  network: "ipv4" | "ipv6" | "unknown";
  isTorExit: boolean | null;
}

export interface CloakingVerificationResult {
  exitIp: string | null;
  isCloaked: boolean;
  leaks: string[];
  directIdentity: ConnectionIdentity | null;
  exitIdentity: ConnectionIdentity | null;
  dnsTransport: "local" | "tor" | "system";
  verificationCategory: PolicyCategory;
  transportVerified: boolean;
  advisories: string[];
}

export interface LeakTestResult {
  testedAt: string;
  strategy: PrivateModeOutboundStrategy | "direct";
  directIp: string | null;
  exitIp: string | null;
  exitRegion: string | null;
  dnsTransport: "local" | "tor" | "system";
  isTorExit: boolean | null;
  leaks: string[];
  directIdentity: ConnectionIdentity | null;
  exitIdentity: ConnectionIdentity | null;
  verificationCategory: PolicyCategory;
  transportVerified: boolean;
  advisories: string[];
}

export interface CircuitStatus {
  sessionId: string;
  workspaceId: string;
  strategy: PrivateModeOutboundStrategy;
  active: boolean;
  exitNodes: string[];
  circuitIds: string[];
  lastRotatedAt?: string;
}

export interface DnsLookupResult {
  address: string;
  family: number;
}

export interface DNSResolver {
  lookupHost(
    hostname: string,
    options?: {
      all?: boolean;
      verbatim?: boolean;
    }
  ): Promise<DnsLookupResult[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}
