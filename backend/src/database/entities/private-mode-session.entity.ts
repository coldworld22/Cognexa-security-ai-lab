import { BaseEntity } from "./base.entity";
import { PrivateModeOutboundStrategy } from "../../services/private-mode/private-mode.types";

export interface PrivateModeSessionEntity extends BaseEntity {
  workspaceId: string;
  strategy: PrivateModeOutboundStrategy;
  exitNodes: string[];
  circuitIds: string[];
  startedAt: string;
  endedAt?: string;
}
