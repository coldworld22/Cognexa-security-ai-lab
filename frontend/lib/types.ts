export interface ConversationSummary {
  id: string;
  workspaceId?: string;
  title: string;
  modelProvider: string;
  modelName: string;
  updatedAt: string;
}

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  memoryType: "preference" | "long_term" | "short_term";
  key: string;
  value: string;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  state: "ready" | "running" | "done";
}

export interface DashboardMetric {
  label: string;
  value: string;
  change: string;
}

export interface AdminDashboard {
  metrics: {
    users: number;
    conversations: {
      total: number;
      last7Days: number;
    };
    messages: number;
    files: {
      total: number;
      indexed: number;
      uploaded: number;
      failed: number;
      indexedToday: number;
    };
    toolExecutions: {
      total: number;
      completed: number;
      failed: number;
      started: number;
      successRate: number;
    };
    tasks: number;
    localModel: {
      status: "up" | "degraded";
      endpoint: string;
      latencyMs: number | null;
      providerCount: number;
    };
  };
  modelUsage: Array<{
    provider: string;
    conversations: number;
  }>;
  health: {
    status: "ok" | "degraded";
    checkedAt: string;
    dependencies: {
      postgres: "up" | "degraded";
      redis: "up" | "degraded";
      llmProviders: LlmProviderCatalog[];
      localModel: {
        status: "up" | "degraded";
        endpoint: string;
        latencyMs?: number;
      };
    };
  };
  availableTools: ToolDescriptor[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: "super_admin" | "admin" | "manager" | "developer" | "viewer";
  preferences: Record<string, unknown>;
  currentWorkspaceId?: string;
  lastLoginAt?: string;
}

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceSummary {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isPersonal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  organizationName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  invitationToken?: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  category: "filesystem" | "repository" | "documentation" | "math" | "database" | "web";
  inputSchema: Record<string, unknown>;
  policyDecision?: "allow" | "warn" | "require_approval" | "deny";
  policyWarnings?: string[];
  requiresApproval?: boolean;
  blocked?: boolean;
}

export interface LlmProviderCatalog {
  id: string;
  models: string[];
}

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

export interface MonitoredEndpoint {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface EndpointInventory {
  endpoints: MonitoredEndpoint[];
  summary: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
    highRisk: number;
    critical: number;
    activeAlerts: number;
  };
}

export interface AdminNetworkEndpoint {
  id: string;
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  interfaceAddress: string;
  macAddress?: string | null;
  vendor?: string | null;
  firstSeenAt: string;
  resolutionSource:
    | "agent"
    | "dns"
    | "netbios"
    | "smb"
    | "mdns"
    | "fortigate"
    | "unresolved";
  resolutionCachedAt?: string;
  operatingSystem: string;
  status: EndpointStatus;
  riskLevel: EndpointRiskLevel;
  lastSeenAt: string;
  loggedInUser?: string;
  telemetry: EndpointTelemetry;
  visibility: "network_only" | "agent";
  activityLevel: "basic_reachability" | "host_telemetry";
  agentInstalled: boolean;
  remoteAccess?: {
    provider: "guacamole" | "meshcentral" | "rustdesk" | "rdp" | "custom";
    mode: "embedded" | "external";
    label: string;
    launchUrl: string;
  };
}

export interface AdminNetworkJob {
  id: string;
  kind: "scan" | "resolve_names";
  state: "queued" | "running" | "completed" | "failed";
  totalTargets: number;
  scannedTargets: number;
  discoveredHosts: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AdminNetworkScan {
  scannedAt: string;
  subnets: string[];
  interfaceAddresses: string[];
  endpoints: AdminNetworkEndpoint[];
  currentJob: AdminNetworkJob | null;
}

export interface AdminNetworkEvent {
  type: "job" | "snapshot";
  job?: AdminNetworkJob | null;
  snapshot?: AdminNetworkScan;
}

export type PrivateModeState = "direct" | "cloaked";
export type PrivateModeOutboundStrategy =
  | "tor"
  | "vpn-chain"
  | "hybrid"
  | "rotating-proxy";
export type PrivateModeTlsFingerprintProfile = "browser" | "curl" | "random";

export interface PrivateModeRelayNode {
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

export interface PrivateModeConfig {
  workspaceId: string;
  mode: PrivateModeState;
  outboundStrategy: PrivateModeOutboundStrategy;
  vpnRelays: PrivateModeRelayNode[];
  torControlPort: number;
  torSocksPort: number;
  dnsOverTor: boolean;
  exitGeographyPreference: string[];
  circuitRotationInterval: number;
  tlsFingerprintProfile: PrivateModeTlsFingerprintProfile;
  requestTimingJitter: number;
  enabledCategories: PolicyCategory[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PrivateModeSession {
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

export interface PrivateModeCircuitStatus {
  sessionId: string;
  workspaceId: string;
  strategy: PrivateModeOutboundStrategy;
  active: boolean;
  exitNodes: string[];
  circuitIds: string[];
  lastRotatedAt?: string;
}

export interface PrivateModeExitLog {
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

export interface PrivateModeConnectionIdentity {
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

export interface PrivateModeVerificationResult {
  exitIp: string | null;
  isCloaked: boolean;
  leaks: string[];
  directIdentity: PrivateModeConnectionIdentity | null;
  exitIdentity: PrivateModeConnectionIdentity | null;
  dnsTransport: "local" | "tor" | "system";
  verificationCategory: PolicyCategory;
  transportVerified: boolean;
  advisories: string[];
}

export interface PrivateModeSessionState {
  session: PrivateModeSession | null;
  circuit: PrivateModeCircuitStatus | null;
  verification: PrivateModeVerificationResult | null;
  routeVerified: boolean;
  verificationError: string | null;
}

export interface PrivateModeLeakTestResult {
  testedAt: string;
  strategy: PrivateModeOutboundStrategy | "direct";
  directIp: string | null;
  exitIp: string | null;
  exitRegion: string | null;
  dnsTransport: "local" | "tor" | "system";
  isTorExit: boolean | null;
  leaks: string[];
  directIdentity: PrivateModeConnectionIdentity | null;
  exitIdentity: PrivateModeConnectionIdentity | null;
  verificationCategory: PolicyCategory;
  transportVerified: boolean;
  advisories: string[];
}

export type WebsiteFindingSeverity = "info" | "low" | "medium" | "high";
export type WebsiteFindingCategory =
  | "transport"
  | "headers"
  | "cookies"
  | "forms"
  | "content"
  | "cors"
  | "exposure";

export type WebsiteScanExposureKind =
  | "api_documentation"
  | "api_endpoint"
  | "database_interface"
  | "internal_service"
  | "sensitive_file";

export interface AdminWebsiteScanFinding {
  id: string;
  severity: WebsiteFindingSeverity;
  category: WebsiteFindingCategory;
  title: string;
  summary: string;
  remediation: string;
  pageUrl?: string;
  evidence: string[];
}

export interface AdminWebsiteScannedPage {
  url: string;
  title: string;
  statusCode: number;
  contentType: string;
  linkCount: number;
  sameOriginLinkCount: number;
  externalLinkCount: number;
  formCount: number;
  loginFormCount: number;
  externalFormActionCount: number;
  insecurePasswordSubmitCount: number;
  inlineScriptCount: number;
  externalScriptCount: number;
  thirdPartyScriptCount: number;
  mixedContentCount: number;
  directoryListingDetected: boolean;
}

export interface AdminWebsiteScan {
  scannedAt: string;
  requestedUrl: string;
  finalUrl: string;
  hostname: string;
  pagesScanned: number;
  maxPages: number;
  sameOriginPagesDiscovered: number;
  securityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findingCounts: Record<WebsiteFindingSeverity, number>;
  analysis: {
    mode: "http" | "browser";
    browserAttempted: boolean;
    browserSucceeded: boolean;
    browserEngine: string | null;
  };
  summary: {
    riskLevel: "low" | "medium" | "high" | "critical";
    headline: string;
    strengths: string[];
    topRisks: string[];
    recommendedActions: string[];
  };
  warnings: string[];
  transport: {
    initialProtocol: "http" | "https";
    finalProtocol: "http" | "https";
    redirectedToHttps: boolean;
    hstsEnabled: boolean;
    certificateTrusted: boolean;
  };
  headers: {
    contentSecurityPolicy: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    referrerPolicy: string | null;
    permissionsPolicy: string | null;
    crossOriginOpenerPolicy: string | null;
    accessControlAllowOrigin: string | null;
    accessControlAllowCredentials: string | null;
    server: string | null;
    xPoweredBy: string | null;
  };
  cookies: {
    total: number;
    missingSecure: number;
    missingHttpOnly: number;
    missingSameSite: number;
  };
  crawl: {
    attemptedPages: number;
    scannedPages: number;
    failedPages: number;
    skippedCrossOriginPages: number;
    skippedNonHtmlPages: number;
    duplicatePagesSkipped: number;
    discoveredSameOriginPages: number;
    discoveredExternalLinks: number;
  };
  surface: {
    totalForms: number;
    loginForms: number;
    externalFormActions: number;
    insecurePasswordSubmissions: number;
    inlineScripts: number;
    externalScripts: number;
    thirdPartyScripts: number;
    mixedContentReferences: number;
    directoryListings: number;
  };
  exposures: {
    probedEndpoints: number;
    publicApiDocs: number;
    publicApiEndpoints: number;
    publicDatabaseInterfaces: number;
    publicInternalServices: number;
    sensitiveFiles: number;
    endpoints: Array<{
      url: string;
      kind: WebsiteScanExposureKind;
      statusCode: number;
      contentType: string;
      evidence: string[];
    }>;
  };
  resources: Array<{
    name: "robots.txt" | "security.txt" | "sitemap.xml";
    path: string;
    status: "present" | "missing" | "error";
    statusCode: number | null;
    finalUrl?: string;
  }>;
  fingerprints: Array<{
    source: "server" | "x-powered-by" | "generator";
    value: string;
    sanitizedValue: string;
  }>;
  pages: AdminWebsiteScannedPage[];
  findings: AdminWebsiteScanFinding[];
}

export type SecurityReviewCheckCategory = WebsiteFindingCategory;

export type SecurityReviewCheckStatus = "pass" | "warn" | "fail" | "info";
export type SecurityReviewFindingSeverity = "low" | "medium" | "high";
export type SecurityReviewAttackerEffort = "low" | "medium" | "high";
export type SecurityReviewConfidence = "low" | "medium" | "high";
export type SecurityReviewPriority = "immediate" | "next" | "hardening";

export interface SecurityReviewCheck {
  id: string;
  category: SecurityReviewCheckCategory;
  status: SecurityReviewCheckStatus;
  name: string;
  expectation: string;
  observed: string;
  evidence: string[];
}

export interface SecurityReviewFinding {
  id: string;
  severity: SecurityReviewFindingSeverity;
  category: SecurityReviewCheckCategory;
  title: string;
  summary: string;
  impact: string;
  attackerEffort: SecurityReviewAttackerEffort;
  confidence: SecurityReviewConfidence;
  priority: SecurityReviewPriority;
  attackerView: string;
  attackerPrerequisites: string[];
  remediation: string;
  fixExample: string;
  safeVerification: string;
  pageUrl?: string;
  evidence: string[];
  checkIds: string[];
}

export interface SecurityReviewAttackPath {
  id: string;
  title: string;
  status: "blocked" | "constrained" | "exposed";
  attackerGoal: string;
  attackerEffort: SecurityReviewAttackerEffort;
  narrative: string;
  blockers: string[];
  example: string;
  nextAction: string;
  supportingCheckIds: string[];
}

export interface SecurityReviewAiDecision {
  title: string;
  priority: SecurityReviewPriority;
  rationale: string;
  safeAction: string;
}

export interface SecurityReviewAiAnalysis {
  status: "ready" | "unavailable";
  provider?: string;
  model?: string;
  headline?: string;
  analystPerspective?: string;
  decisiveVerdict?: string;
  decisions: SecurityReviewAiDecision[];
  retestFocus: string[];
  constraints: string[];
  unavailableReason?: string;
}

export interface AdminSecurityReviewResult {
  reviewedAt: string;
  target: {
    requestedUrl: string;
    finalUrl: string;
    hostname: string;
    pagesScanned: number;
    maxPages: number;
  };
  posture: {
    securityScore: number;
    grade: "A" | "B" | "C" | "D" | "F";
    analysisMode: "http" | "browser";
    browserEngine: string | null;
  };
  summary: {
    riskLevel: "low" | "medium" | "high" | "critical";
    headline: string;
    strengths: string[];
    topRisks: string[];
    recommendedActions: string[];
    exposedAttackPaths: number;
    constrainedAttackPaths: number;
    roadmap: {
      immediate: string[];
      next: string[];
      hardening: string[];
    };
  };
  attackPaths: SecurityReviewAttackPath[];
  counts: {
    pass: number;
    warn: number;
    fail: number;
  };
  warnings: string[];
  checks: SecurityReviewCheck[];
  findings: SecurityReviewFinding[];
  aiAnalysis: SecurityReviewAiAnalysis;
}

export type DomainOwnershipVerificationMethod =
  | "dns_txt"
  | "http_file"
  | "html_meta";

export type DomainOwnershipVerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "expired";

export type AuthorizedSecurityTestModule =
  | "sql_injection"
  | "xss"
  | "csrf"
  | "authentication"
  | "authorization"
  | "api_security"
  | "ssrf"
  | "open_redirect"
  | "business_logic"
  | "oauth_flow"
  | "waf"
  | "session_management";

export type AuthorizedSecurityTestRunStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed";

export type AuthorizedSecurityFindingSeverity = "info" | "low" | "medium" | "high";
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
export type AuthorizedSecurityAdaptationUrgency = "low" | "medium" | "high";

export interface DomainOwnershipVerificationSummary {
  id: string;
  requestedByUserId?: string;
  hostname: string;
  method: DomainOwnershipVerificationMethod;
  challengeToken: string;
  challengeDetails: Record<string, unknown>;
  instructions: string[];
  status: DomainOwnershipVerificationStatus;
  verificationMode?: "standard" | "development_local" | "development_bypass";
  bypassActive?: boolean;
  verifiedAt?: string;
  expiresAt: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorizedTestingDevModeStatus {
  environment: "development" | "test" | "production";
  available: boolean;
  bypassVerification: boolean;
  requiresExplicitOptIn: boolean;
  allowedDomains: string[];
  message: string;
}

export interface AuthorizedSecurityTestAuthProfileSummary {
  name: string;
  role: "anonymous" | "low_privilege" | "high_privilege";
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
  status: "blocked" | "constrained" | "exposed";
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

export interface AuthorizedSecurityTimelineEvent {
  id: string;
  eventType:
    | "status"
    | "ownership"
    | "guardrail"
    | "plan"
    | "discovery"
    | "request"
    | "finding"
    | "warning"
    | "summary";
  severity: AuthorizedSecurityFindingSeverity;
  category?: AuthorizedSecurityTestModule;
  message: string;
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
  riskLevel: "low" | "medium" | "high" | "critical";
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
  events: AuthorizedSecurityTimelineEvent[];
}

export interface AuthorizedSecurityTestRunSummary {
  runId: string;
  status: AuthorizedSecurityTestRunStatus;
  requestedUrl: string;
  hostname: string;
  executedAt: string;
  completedAt?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: number;
  highSeverityFindings: number;
}

export interface AdvancedPenetrationTestRunSummary {
  runId: string;
  taskId?: string;
  agentId?: string;
  target: string;
  status: AgentTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  vulnerabilities: number;
  attackChains: number;
  finalSummary?: string;
}

export interface AdvancedPenetrationTestAuditEntry {
  id: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface AdvancedPenetrationTestRunDetail {
  runId: string;
  taskId?: string;
  agentId?: string;
  target: string;
  status: AgentTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  finalSummary?: string;
  context: Record<string, unknown>;
  auditTrail: AdvancedPenetrationTestAuditEntry[];
  report?: Record<string, unknown>;
}

export interface MemoryContext {
  preferences: MemoryItem[];
  longTerm: MemoryItem[];
  shortTerm: ChatMessage[];
}

export type AgentTaskStatus = "queued" | "running" | "completed" | "failed";

export type AgentTaskStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface AgentDefinition {
  id: string;
  workspaceId?: string;
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskPlanStep {
  id: string;
  title: string;
  rationale: string;
}

export interface AgentTaskTraceStep {
  id: string;
  title: string;
  rationale: string;
  status: AgentTaskStepStatus;
  startedAt?: string;
  finishedAt?: string;
  note?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolExecutionId?: string;
  toolOutputPreview?: string;
  error?: string;
}

export interface AgentTaskMetadata {
  steps: AgentTaskTraceStep[];
  executedTools: string[];
  reasoningLog: string[];
  finalSummary?: string;
  lastUpdatedAt?: string;
}

export interface AgentTaskSummary {
  id: string;
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: AgentTaskStatus;
  result?: string;
  metadata: AgentTaskMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolExecution {
  id: string;
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: "started" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskDetail {
  task: AgentTaskSummary;
  toolExecutions: AgentToolExecution[];
}

export interface AgentExecutionResult {
  summary: string;
  executedTools: string[];
  steps: AgentTaskTraceStep[];
  reasoningLog: string[];
}

export type PolicyScopeType = "global" | "organization" | "workspace" | "user";
export type PolicyAssignmentType = "baseline" | "mode" | "overlay";
export type PolicyMode = "open" | "strict" | "enterprise" | "research" | "custom";
export type PolicyCategory =
  | "code_generation"
  | "security_research"
  | "vulnerability_analysis"
  | "document_access"
  | "external_url_access"
  | "agent_execution"
  | "tool_usage"
  | "file_uploads"
  | "database_queries"
  | "command_execution";
export type PolicyDecision = "allow" | "warn" | "require_approval" | "deny";

export interface PolicyRule {
  id: string;
  policyId: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  enabled: boolean;
  priority: number;
  description?: string;
  toolNames: string[];
  roleScopes: AuthenticatedUser["role"][];
  workspaceRoleScopes: WorkspaceRole[];
  modelPatterns: string[];
  conditions: {
    contentPatterns?: string[];
    urlHosts?: string[];
    urlNotHosts?: string[];
    fileExtensions?: string[];
    maxFileSizeBytes?: number;
    metadataEquals?: Record<string, string | number | boolean>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PolicyAssignment {
  id: string;
  policyId: string;
  scopeType: PolicyScopeType;
  scopeId?: string;
  assignmentType: PolicyAssignmentType;
  mode?: PolicyMode;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  mode: PolicyMode;
  isSystem: boolean;
  isActive: boolean;
  createdByUserId?: string;
  metadata: Record<string, unknown>;
  rules: PolicyRule[];
  assignments: PolicyAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyCatalog {
  policies: PolicyDefinition[];
  currentWorkspaceMode: PolicyMode;
  availableModes: PolicyMode[];
}

export interface PolicyEvaluationMatch {
  policyId: string;
  policyName: string;
  ruleId?: string;
  assignmentId?: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  scopeType: PolicyScopeType;
  scopeId?: string;
  mode: PolicyMode;
  description?: string;
  priority: number;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  blocking: boolean;
  requiresApproval: boolean;
  warnings: string[];
  matchedRules: PolicyEvaluationMatch[];
  mode: PolicyMode;
  evaluatedAt: string;
}

export interface PolicyAuditLog {
  id: string;
  userId?: string;
  workspaceId?: string;
  organizationId?: string;
  action: string;
  category: PolicyCategory;
  toolName?: string;
  model?: string;
  provider?: string;
  decision: PolicyDecision;
  mode: PolicyMode;
  policyId?: string;
  matchedRuleId?: string;
  scopeType: PolicyScopeType;
  scopeId?: string;
  requestContext: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
