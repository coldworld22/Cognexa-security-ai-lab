import { BaseEntity } from "./base.entity";

export type EndpointStatus = "online" | "degraded" | "offline";
export type EndpointRiskLevel = "low" | "medium" | "high" | "critical";

export interface EndpointTelemetry {
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  diskUsagePercent?: number;
  latencyMs?: number | null;
  activeAlerts: number;
  networkRxKbps?: number;
  networkTxKbps?: number;
}

export interface MonitoredEndpointEntity extends BaseEntity {
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
  metadata: Record<string, unknown>;
}
