export type MobileAppFileType = "apk" | "ipa" | "aab";
export type MobileScanExportFormat = "json" | "pdf";

export interface Permission {
  name: string;
  status: "dangerous" | "normal" | "signature" | "unknown";
  risk: "low" | "medium" | "high";
  description: string;
  reason: string;
}

export interface Summary {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  totalPermissions: number;
  riskyPermissions: number;
  trackerCount: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  headline: string;
}

export interface Vulnerability {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  file: string;
  line: number;
  remediation: string;
}

export interface ParsedReport {
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

export interface ScanResult extends ParsedReport {
  id: string;
  workspaceId: string;
}

export interface MobileScanExportResult {
  contentType: string;
  fileName: string;
  body: Buffer;
}

export interface MobileScanRequest {
  workspaceId: string;
  filePath: string;
  fileName: string;
  fileType: MobileAppFileType;
}
