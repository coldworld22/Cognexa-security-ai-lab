import { BaseEntity } from "./base.entity";
import {
  EndpointRiskLevel,
  EndpointStatus,
  EndpointTelemetry
} from "./monitored-endpoint.entity";

export interface ManagedEndpointEntity extends BaseEntity {
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
  metadata: Record<string, unknown>;
}
