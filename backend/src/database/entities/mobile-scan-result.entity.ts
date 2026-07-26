import { BaseEntity } from "./base.entity";
import {
  Permission,
  Summary,
  Vulnerability
} from "../../services/mobile/mobile-scan.types";

export interface MobileScanResultEntity extends BaseEntity {
  workspaceId: string;
  appName: string;
  packageName: string;
  version: string;
  targetSdk: number;
  minSdk: number;
  fileSize: number;
  securityScore: number;
  permissions: Permission[];
  vulnerabilities: Vulnerability[];
  trackers: string[];
  summary: Summary;
  recommendations: string[];
  scanDate: string;
}
