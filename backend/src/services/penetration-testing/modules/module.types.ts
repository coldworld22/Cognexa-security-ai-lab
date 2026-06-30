import type {
  AuthorizedSecurityFinding,
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityTestAuthProfile,
  AuthorizedSecurityTestEventType,
  AuthorizedSecurityTestModule
} from "../../authorized-testing/authorized-security-testing.types";
import type { WebsiteScanResult } from "../../website-scanner/website-scanner.service";

export interface ProbeResponseSummary {
  eventId: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  headers: Headers;
  body: string;
  bodyHash: string;
}

export interface ModuleExecutionResult {
  findings: AuthorizedSecurityFinding[];
  warnings: string[];
}

export interface ModuleStateLike {
  runId: string;
  requestedUrl: URL;
}

export interface ModuleEventInput {
  eventType: AuthorizedSecurityTestEventType;
  severity: AuthorizedSecurityFindingSeverity;
  message: string;
  category?: AuthorizedSecurityTestModule;
  metadata?: Record<string, unknown>;
}

export interface ModuleProbeInput {
  category: AuthorizedSecurityTestModule;
  label: string;
  method?: "GET" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  authProfile?: AuthorizedSecurityTestAuthProfile;
}

export interface PenetrationTestingModuleContext<
  TRunState extends ModuleStateLike
> {
  state: TRunState;
  scan: WebsiteScanResult;
  authProfiles: AuthorizedSecurityTestAuthProfile[];
  performProbe: (
    state: TRunState,
    url: URL,
    input: ModuleProbeInput
  ) => Promise<ProbeResponseSummary | null>;
  logEvent: (
    runId: string,
    event: ModuleEventInput
  ) => Promise<{ id: string }>;
}
