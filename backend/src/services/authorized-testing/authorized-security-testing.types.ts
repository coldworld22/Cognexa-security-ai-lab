export const DOMAIN_OWNERSHIP_VERIFICATION_METHODS = [
  "dns_txt",
  "http_file",
  "html_meta"
] as const;

export const DOMAIN_OWNERSHIP_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "failed",
  "expired"
] as const;

export const AUTHORIZED_SECURITY_TEST_MODULES = [
  "sql_injection",
  "xss",
  "csrf",
  "authentication",
  "authorization",
  "api_security",
  "ssrf",
  "open_redirect",
  "business_logic",
  "oauth_flow",
  "waf",
  "session_management"
] as const;

export const AUTHORIZED_SECURITY_TEST_RUN_STATUSES = [
  "planned",
  "running",
  "completed",
  "failed"
] as const;

export const AUTHORIZED_SECURITY_TEST_EVENT_TYPES = [
  "status",
  "ownership",
  "guardrail",
  "plan",
  "discovery",
  "request",
  "finding",
  "warning",
  "summary"
] as const;

export type DomainOwnershipVerificationMethod =
  (typeof DOMAIN_OWNERSHIP_VERIFICATION_METHODS)[number];

export type DomainOwnershipVerificationStatus =
  (typeof DOMAIN_OWNERSHIP_VERIFICATION_STATUSES)[number];

export type AuthorizedSecurityTestModule =
  (typeof AUTHORIZED_SECURITY_TEST_MODULES)[number];

export type AuthorizedSecurityTestRunStatus =
  (typeof AUTHORIZED_SECURITY_TEST_RUN_STATUSES)[number];

export type AuthorizedSecurityTestEventType =
  (typeof AUTHORIZED_SECURITY_TEST_EVENT_TYPES)[number];

export type AuthorizedSecurityFindingSeverity =
  | "info"
  | "low"
  | "medium"
  | "high";

export type AuthorizedApiVulnerabilityType =
  | "idor"
  | "mass_assignment"
  | "auth_bypass"
  | "rate_limiting"
  | "data_leakage"
  | "sql_injection"
  | "xss"
  | "csrf"
  | "ssrf"
  | "open_redirect"
  | "oauth_flow";

export type AuthorizedSecurityFindingDisposition =
  | "confirmed"
  | "needs_review"
  | "unlikely";

export type AuthorizedSecurityRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type AuthorizedSecurityAttackPathStatus =
  | "blocked"
  | "constrained"
  | "exposed";

export type AuthorizedSecurityAdaptationUrgency =
  | "low"
  | "medium"
  | "high";

export interface StartDomainOwnershipVerificationRequest {
  target: string;
  method?: DomainOwnershipVerificationMethod;
  devModeBypass?: boolean;
}

export interface DomainOwnershipVerificationChallenge {
  hostname: string;
  method: DomainOwnershipVerificationMethod;
  challengeToken: string;
  challengeDetails: Record<string, unknown>;
  instructions: string[];
  status: DomainOwnershipVerificationStatus;
  verifiedAt?: string;
  expiresAt: string;
}

export interface DomainOwnershipVerificationSummary
  extends DomainOwnershipVerificationChallenge {
  id: string;
  requestedByUserId?: string;
  verificationMode?: "standard" | "development_local" | "development_bypass";
  bypassActive?: boolean;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorizedSecurityTestAuthProfile {
  name: string;
  role: "anonymous" | "low_privilege" | "high_privilege";
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

export interface AuthorizedSecurityTestAuthProfileSummary {
  name: string;
  role: AuthorizedSecurityTestAuthProfile["role"];
  headerNames: string[];
  cookieNames: string[];
}

export interface AuthorizedSecurityTestAuthEndpointDescriptorInput {
  type: "auth_api";
  name: string;
  entryUrl: string;
  endpoint: string;
  method?: "POST";
  contentType?: string;
  fields: string[];
  tokenFields?: string[];
  stagingOnly?: boolean;
  productionMode?: "passive_only";
}

export interface AuthorizedSecurityManualFormValidationInput {
  rateLimitPerMinute?: number;
  credentialLabels?: string[];
  notes?: string;
}

export interface AuthorizedSecurityManualFormValidation {
  rateLimitPerMinute: number;
  credentialLabels: string[];
  notes?: string;
}

export interface AuthorizedSecurityTestAuthEndpointDescriptor {
  type: "auth_api";
  name: string;
  entryUrl: string;
  endpoint: string;
  method: "POST";
  contentType: string;
  fields: string[];
  tokenFields: string[];
  stagingOnly: boolean;
  productionMode: "passive_only";
}

export interface RunAuthorizedSecurityTestRequest {
  verificationId?: string;
  url: string;
  maxPages?: number;
  maxRequests?: number;
  modules?: AuthorizedSecurityTestModule[];
  authProfiles?: AuthorizedSecurityTestAuthProfile[];
  authEndpointDescriptors?: AuthorizedSecurityTestAuthEndpointDescriptorInput[];
  manualFormValidation?: AuthorizedSecurityManualFormValidationInput;
  devModeBypass?: boolean;
}

export interface AuthorizedTestingDevModeStatus {
  environment: "development" | "test" | "production";
  available: boolean;
  bypassVerification: boolean;
  requiresExplicitOptIn: boolean;
  allowedDomains: string[];
  message: string;
}

export interface AuthorizedSecurityPlanStep {
  id: string;
  category: AuthorizedSecurityTestModule;
  title: string;
  objective: string;
  safeMethod: string;
  stopConditions: string[];
}

export interface AuthorizedSecurityModulePriority {
  module: AuthorizedSecurityTestModule;
  score: number;
  reasons: string[];
}

export interface AuthorizedSecurityBaseline {
  requestedUrl: string;
  finalUrl: string;
  hostname: string;
  pagesScanned: number;
  maxPages: number;
  securityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  passiveWarnings: string[];
  declaredAuthEndpoints: AuthorizedSecurityTestAuthEndpointDescriptor[];
  manualFormValidation?: AuthorizedSecurityManualFormValidation;
}

export interface AuthorizedApiFindingDetails {
  endpoint: string;
  method: "GET" | "HEAD" | "OPTIONS";
  vulnerabilityType: AuthorizedApiVulnerabilityType;
  confidence: number;
  poc: string;
}

export interface AuthorizedSecurityFinding {
  id: string;
  category: AuthorizedSecurityTestModule;
  severity: AuthorizedSecurityFindingSeverity;
  title: string;
  summary: string;
  evidence: string[];
  remediation: string;
  safeRetest: string;
  supportingEventIds: string[];
  apiDetails?: AuthorizedApiFindingDetails;
  validation?: {
    source: "ai" | "heuristic";
    disposition: AuthorizedSecurityFindingDisposition;
    confidence: number;
    rationale: string;
  };
}

export interface AuthorizedSecurityAttackPath {
  id: string;
  title: string;
  status: AuthorizedSecurityAttackPathStatus;
  narrative: string;
  supportingFindingIds: string[];
  remediationPriority: "immediate" | "next" | "hardening";
  safeValidation: string;
  source?: "ai" | "heuristic";
  confidence?: number;
}

export interface AuthorizedSecurityAdaptationDecision {
  id: string;
  module: AuthorizedSecurityTestModule;
  source: "ai" | "heuristic";
  rationale: string;
  triggerFindingIds: string[];
  triggerCategories: AuthorizedSecurityTestModule[];
  urgency: AuthorizedSecurityAdaptationUrgency;
}

export interface AuthorizedSecurityCampaignStorySection {
  id: "recon" | "plan" | "execute" | "adapt" | "report";
  title: string;
  narrative: string;
  evidence: string[];
}

export interface AuthorizedSecurityCampaignStory {
  headline: string;
  narrative: string;
  sections: AuthorizedSecurityCampaignStorySection[];
  chainHighlights: string[];
}

export interface AuthorizedSecurityPrediction {
  id: string;
  category: AuthorizedSecurityTestModule;
  title: string;
  likelihood: "low" | "medium" | "high";
  rationale: string;
  indicators: string[];
  recommendedCheck: string;
  source: "ai" | "heuristic";
}

export interface AuthorizedSecurityTestTimelineEvent {
  id: string;
  eventType: AuthorizedSecurityTestEventType;
  severity: AuthorizedSecurityFindingSeverity;
  message: string;
  category?: AuthorizedSecurityTestModule;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuthorizedSecurityAiAnalysis {
  status: "ready" | "unavailable";
  provider?: string;
  model?: string;
  headline?: string;
  executiveSummary?: string;
  predictions: AuthorizedSecurityPrediction[];
  nextSteps: string[];
  unavailableReason?: string;
}

export interface AuthorizedSecurityTestSummary {
  riskLevel: AuthorizedSecurityRiskLevel;
  headline: string;
  planSource: "ai" | "deterministic";
  requestBudget: number;
  requestsSent: number;
  modulesExecuted: AuthorizedSecurityTestModule[];
  prioritizedModules?: AuthorizedSecurityModulePriority[];
  executionInsights?: {
    moduleConcurrency: number;
    probeCacheHits: number;
    probeCacheMisses: number;
    adaptiveBackoffCount: number;
    rateLimitedResponses: number;
    networkRequestsSent: number;
  };
  adaptation?: {
    followUpExecuted: AuthorizedSecurityTestModule[];
    decisions: AuthorizedSecurityAdaptationDecision[];
  };
  campaignStory?: AuthorizedSecurityCampaignStory;
  findingCounts: Record<AuthorizedSecurityFindingSeverity, number>;
  recommendedActions: string[];
  reversible: boolean;
}

export interface AuthorizedSecurityTestReport {
  runId: string;
  status: AuthorizedSecurityTestRunStatus;
  requestedByUserId?: string;
  executedAt: string;
  completedAt?: string;
  target: {
    requestedUrl: string;
    hostname: string;
  };
  ownership: DomainOwnershipVerificationSummary;
  guardrails: string[];
  authProfiles: AuthorizedSecurityTestAuthProfileSummary[];
  baseline: AuthorizedSecurityBaseline;
  plan: AuthorizedSecurityPlanStep[];
  summary: AuthorizedSecurityTestSummary;
  findings: AuthorizedSecurityFinding[];
  attackPaths: AuthorizedSecurityAttackPath[];
  aiAnalysis: AuthorizedSecurityAiAnalysis;
  warnings: string[];
  events: AuthorizedSecurityTestTimelineEvent[];
}

export interface AuthorizedSecurityTestRunSummary {
  runId: string;
  status: AuthorizedSecurityTestRunStatus;
  requestedUrl: string;
  hostname: string;
  executedAt: string;
  completedAt?: string;
  riskLevel: AuthorizedSecurityRiskLevel;
  findings: number;
  highSeverityFindings: number;
}
