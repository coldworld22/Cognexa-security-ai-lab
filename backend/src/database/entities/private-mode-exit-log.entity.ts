import { BaseEntity } from "./base.entity";

export interface PrivateModeExitLogEntity extends BaseEntity {
  sessionId: string;
  workspaceId: string;
  exitIp: string;
  exitRegion: string;
  targetHost: string;
  requestType: string;
  timestamp: string;
}
