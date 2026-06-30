"use client";

import {
  AgentDefinition,
  AgentExecutionResult,
  AgentTaskDetail,
  AgentTaskPlanStep,
  AgentTaskSummary,
  AdminDashboard,
  AdminNetworkEvent,
  AdminNetworkJob,
  AdminNetworkScan,
  PrivateModeCircuitStatus,
  PrivateModeConfig,
  PrivateModeExitLog,
  PrivateModeLeakTestResult,
  PrivateModeSessionState,
  PrivateModeSession,
  PrivateModeVerificationResult,
  AdminSecurityReviewResult,
  AuthorizedTestingDevModeStatus,
  AdvancedPenetrationTestRunDetail,
  AdvancedPenetrationTestRunSummary,
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunSummary,
  AdminWebsiteScan,
  DomainOwnershipVerificationMethod,
  DomainOwnershipVerificationSummary,
  EndpointInventory,
  MonitoredEndpoint,
  PolicyAuditLog,
  PolicyCatalog,
  PolicyEvaluationResult,
  PolicyMode,
  AuthenticatedUser,
  ChatMessage,
  ConversationSummary,
  LlmProviderCatalog,
  MemoryContext,
  ToolDescriptor,
  WorkspaceInvitation,
  WorkspaceRole,
  WorkspaceSummary
} from "./types";
import { SessionPersistence } from "./auth-cookies";

const API_URL = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const SESSION_STORAGE_KEY = "security-ai-lab.session";
const NETWORK_ERROR_MESSAGE =
  "Unable to reach the server. Check that the backend is running and try again.";
const APP_ROLES = new Set(["super_admin", "admin", "manager", "developer", "viewer"]);

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AppSession {
  user: AuthenticatedUser;
  tokens: SessionTokens;
  currentWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitation[];
}

export interface ExecuteAgentPayload {
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
  objective: string;
  conversationId?: string;
}

export interface ExecuteAgentResponse extends AgentTaskDetail {
  agent: AgentDefinition;
  plan: AgentTaskPlanStep[];
  result: AgentExecutionResult | null;
}

export interface CreateMonitoredEndpointPayload {
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  operatingSystem: string;
  loggedInUser?: string;
  tags?: string[];
}

interface AuthPayload {
  username: string;
  password: string;
}

function resolveDefaultApiUrl(): string {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "https://localhost:5000/api/v1";
  }

  return "http://localhost:5000/api/v1";
}

function resolveApiUrl(configuredUrl?: string): string {
  const trimmedConfiguredUrl = configuredUrl?.trim();
  if (!trimmedConfiguredUrl) {
    return resolveDefaultApiUrl();
  }

  if (!isBrowser()) {
    return trimmedConfiguredUrl.replace(/\/$/, "");
  }

  try {
    const parsedUrl = new URL(trimmedConfiguredUrl);

    if (
      window.location.protocol === "http:" &&
      parsedUrl.protocol === "https:" &&
      isLocalhostHostname(window.location.hostname) &&
      isLocalhostHostname(parsedUrl.hostname)
    ) {
      parsedUrl.protocol = "http:";
      return parsedUrl.toString().replace(/\/$/, "");
    }
  } catch {
    return trimmedConfiguredUrl.replace(/\/$/, "");
  }

  return trimmedConfiguredUrl.replace(/\/$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1"
  );
}

export interface WorkspaceSessionPayload {
  currentWorkspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitation[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getStorageForPersistence(persistence: SessionPersistence): Storage | null {
  if (!isBrowser()) {
    return null;
  }

  return persistence === "session" ? window.sessionStorage : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const EMPTY_AUTHORIZED_SECURITY_BASELINE: AuthorizedSecurityTestReport["baseline"] = {
  requestedUrl: "",
  finalUrl: "",
  hostname: "",
  pagesScanned: 0,
  maxPages: 0,
  securityScore: 0,
  grade: "F",
  passiveWarnings: [],
  declaredAuthEndpoints: []
};

const EMPTY_AUTHORIZED_SECURITY_SUMMARY: AuthorizedSecurityTestReport["summary"] = {
  riskLevel: "low",
  headline: "",
  planSource: "deterministic",
  requestBudget: 0,
  requestsSent: 0,
  modulesExecuted: [],
  findingCounts: {
    info: 0,
    low: 0,
    medium: 0,
    high: 0
  },
  recommendedActions: [],
  reversible: true
};

const EMPTY_AUTHORIZED_SECURITY_AI_ANALYSIS: AuthorizedSecurityTestReport["aiAnalysis"] =
  {
    status: "unavailable",
    predictions: [],
    nextSteps: []
  };

function normalizeAuthorizedSecurityTestReport(
  report: AuthorizedSecurityTestReport
): AuthorizedSecurityTestReport {
  const baselineSource: Record<string, unknown> = isRecord(report.baseline)
    ? report.baseline
    : {};
  const summarySource: Record<string, unknown> = isRecord(report.summary)
    ? report.summary
    : {};
  const aiAnalysisSource: Record<string, unknown> = isRecord(report.aiAnalysis)
    ? report.aiAnalysis
    : {};

  const executionInsights = isRecord(summarySource.executionInsights)
    ? {
        moduleConcurrency: asNumber(summarySource.executionInsights.moduleConcurrency),
        probeCacheHits: asNumber(summarySource.executionInsights.probeCacheHits),
        probeCacheMisses: asNumber(summarySource.executionInsights.probeCacheMisses),
        adaptiveBackoffCount: asNumber(
          summarySource.executionInsights.adaptiveBackoffCount
        ),
        rateLimitedResponses: asNumber(
          summarySource.executionInsights.rateLimitedResponses
        ),
        networkRequestsSent: asNumber(
          summarySource.executionInsights.networkRequestsSent
        )
      }
    : undefined;

  const adaptation = isRecord(summarySource.adaptation)
    ? {
        ...summarySource.adaptation,
        followUpExecuted: asArray<
          NonNullable<AuthorizedSecurityTestReport["summary"]["adaptation"]>["followUpExecuted"][number]
        >(summarySource.adaptation.followUpExecuted),
        decisions: asArray<
          NonNullable<AuthorizedSecurityTestReport["summary"]["adaptation"]>["decisions"][number]
        >(summarySource.adaptation.decisions).map((decision) => ({
          ...decision,
          triggerFindingIds: isRecord(decision)
            ? asStringArray(decision.triggerFindingIds)
            : [],
          triggerCategories: isRecord(decision)
            ? asArray<
                NonNullable<AuthorizedSecurityTestReport["summary"]["adaptation"]>["decisions"][number]["triggerCategories"][number]
              >(decision.triggerCategories)
            : []
        }))
      }
    : undefined;

  const campaignStory = isRecord(summarySource.campaignStory)
    ? {
        ...summarySource.campaignStory,
        headline: asString(summarySource.campaignStory.headline),
        narrative: asString(summarySource.campaignStory.narrative),
        sections: asArray<
          NonNullable<AuthorizedSecurityTestReport["summary"]["campaignStory"]>["sections"][number]
        >(summarySource.campaignStory.sections).map((section) => ({
          ...section,
          evidence: isRecord(section) ? asStringArray(section.evidence) : []
        })),
        chainHighlights: asStringArray(summarySource.campaignStory.chainHighlights)
      }
    : undefined;

  return {
    ...report,
    guardrails: asStringArray(report.guardrails),
    authProfiles: asArray<AuthorizedSecurityTestReport["authProfiles"][number]>(
      report.authProfiles
    ).map((profile) => ({
      ...profile,
      headerNames: isRecord(profile) ? asStringArray(profile.headerNames) : [],
      cookieNames: isRecord(profile) ? asStringArray(profile.cookieNames) : []
    })),
    baseline: {
      ...EMPTY_AUTHORIZED_SECURITY_BASELINE,
      ...baselineSource,
      pagesScanned: asNumber(
        baselineSource.pagesScanned,
        EMPTY_AUTHORIZED_SECURITY_BASELINE.pagesScanned
      ),
      maxPages: asNumber(
        baselineSource.maxPages,
        EMPTY_AUTHORIZED_SECURITY_BASELINE.maxPages
      ),
      securityScore: asNumber(
        baselineSource.securityScore,
        EMPTY_AUTHORIZED_SECURITY_BASELINE.securityScore
      ),
      passiveWarnings: asStringArray(baselineSource.passiveWarnings),
      declaredAuthEndpoints: asArray<
        AuthorizedSecurityTestReport["baseline"]["declaredAuthEndpoints"][number]
      >(baselineSource.declaredAuthEndpoints),
      manualFormValidation: isRecord(baselineSource.manualFormValidation)
        ? {
            rateLimitPerMinute: Math.max(
              1,
              Math.min(
                60,
                asNumber(baselineSource.manualFormValidation.rateLimitPerMinute, 5)
              )
            ),
            credentialLabels: asStringArray(
              baselineSource.manualFormValidation.credentialLabels
            ),
            ...(asString(baselineSource.manualFormValidation.notes).trim()
              ? {
                  notes: asString(
                    baselineSource.manualFormValidation.notes
                  ).trim()
                }
              : {})
          }
        : undefined
    },
    plan: asArray<AuthorizedSecurityTestReport["plan"][number]>(report.plan).map(
      (step) => ({
        ...step,
        stopConditions: isRecord(step) ? asStringArray(step.stopConditions) : []
      })
    ),
    summary: {
      ...EMPTY_AUTHORIZED_SECURITY_SUMMARY,
      ...summarySource,
      requestBudget: asNumber(
        summarySource.requestBudget,
        EMPTY_AUTHORIZED_SECURITY_SUMMARY.requestBudget
      ),
      requestsSent: asNumber(
        summarySource.requestsSent,
        EMPTY_AUTHORIZED_SECURITY_SUMMARY.requestsSent
      ),
      modulesExecuted: asArray<
        AuthorizedSecurityTestReport["summary"]["modulesExecuted"][number]
      >(summarySource.modulesExecuted),
      prioritizedModules: Array.isArray(summarySource.prioritizedModules)
        ? (summarySource.prioritizedModules as AuthorizedSecurityTestReport["summary"]["prioritizedModules"])
        : undefined,
      executionInsights,
      adaptation,
      campaignStory,
      findingCounts: isRecord(summarySource.findingCounts)
        ? {
            info: asNumber(summarySource.findingCounts.info),
            low: asNumber(summarySource.findingCounts.low),
            medium: asNumber(summarySource.findingCounts.medium),
            high: asNumber(summarySource.findingCounts.high)
          }
        : EMPTY_AUTHORIZED_SECURITY_SUMMARY.findingCounts,
      recommendedActions: asStringArray(summarySource.recommendedActions),
      reversible: asBoolean(
        summarySource.reversible,
        EMPTY_AUTHORIZED_SECURITY_SUMMARY.reversible
      )
    },
    findings: asArray<AuthorizedSecurityTestReport["findings"][number]>(report.findings).map(
      (finding) => ({
        ...finding,
        evidence: isRecord(finding) ? asStringArray(finding.evidence) : [],
        supportingEventIds: isRecord(finding)
          ? asStringArray(finding.supportingEventIds)
          : []
      })
    ),
    attackPaths: asArray<AuthorizedSecurityTestReport["attackPaths"][number]>(
      report.attackPaths
    ).map((attackPath) => ({
      ...attackPath,
      supportingFindingIds: isRecord(attackPath)
        ? asStringArray(attackPath.supportingFindingIds)
        : []
    })),
    aiAnalysis: {
      ...EMPTY_AUTHORIZED_SECURITY_AI_ANALYSIS,
      ...aiAnalysisSource,
      predictions: asArray<
        AuthorizedSecurityTestReport["aiAnalysis"]["predictions"][number]
      >(aiAnalysisSource.predictions).map((prediction) => ({
        ...prediction,
        indicators: isRecord(prediction) ? asStringArray(prediction.indicators) : []
      })),
      nextSteps: asStringArray(aiAnalysisSource.nextSteps)
    },
    warnings: asStringArray(report.warnings),
    events: asArray<AuthorizedSecurityTestReport["events"][number]>(report.events)
  };
}

function parseStoredSession(value: unknown): AppSession | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.tokens)) {
    return null;
  }

  const { user, tokens } = value;
  const { id, email, displayName, role, preferences, currentWorkspaceId, lastLoginAt } = user;
  const { accessToken, refreshToken } = tokens;

  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof displayName !== "string" ||
    typeof role !== "string" ||
    !APP_ROLES.has(role) ||
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string"
  ) {
    return null;
  }

  return {
    user: {
      id,
      email,
      displayName,
      role: role as AuthenticatedUser["role"],
      preferences: isRecord(preferences) ? preferences : {},
      currentWorkspaceId:
        typeof currentWorkspaceId === "string" ? currentWorkspaceId : undefined,
      lastLoginAt: typeof lastLoginAt === "string" ? lastLoginAt : undefined
    },
    tokens: {
      accessToken,
      refreshToken
    },
    currentWorkspace: isRecord(value.currentWorkspace)
      ? (value.currentWorkspace as unknown as WorkspaceSummary)
      : null,
    workspaces: Array.isArray(value.workspaces) ? (value.workspaces as WorkspaceSummary[]) : [],
    pendingInvitations: Array.isArray(value.pendingInvitations)
      ? (value.pendingInvitations as WorkspaceInvitation[])
      : []
  };
}

function readStoredSession() {
  if (!isBrowser()) {
    return null;
  }

  const storages: Array<{
    persistence: SessionPersistence;
    storage: Storage;
  }> = [
    {
      persistence: "local",
      storage: window.localStorage
    },
    {
      persistence: "session",
      storage: window.sessionStorage
    }
  ];

  for (const entry of storages) {
    const raw = entry.storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      continue;
    }

    try {
      const parsed = parseStoredSession(JSON.parse(raw));
      if (!parsed) {
        entry.storage.removeItem(SESSION_STORAGE_KEY);
        continue;
      }

      return {
        persistence: entry.persistence,
        session: parsed
      };
    } catch {
      entry.storage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  return null;
}

export function getStoredSessionPersistence(): SessionPersistence | null {
  return readStoredSession()?.persistence ?? null;
}

export function getStoredSession(): AppSession | null {
  return readStoredSession()?.session ?? null;
}

export function storeSession(
  session: AppSession,
  persistence?: SessionPersistence
): void {
  const resolvedPersistence =
    persistence ?? readStoredSession()?.persistence ?? "local";
  const storage = getStorageForPersistence(resolvedPersistence);

  if (!storage || !isBrowser()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  void clearSessionCookies();
}

export function mergeSessionWithWorkspacePayload(
  session: AppSession,
  payload: WorkspaceSessionPayload
): AppSession {
  return {
    ...session,
    user: {
      ...session.user,
      currentWorkspaceId: payload.currentWorkspace.id
    },
    currentWorkspace: payload.currentWorkspace,
    workspaces: payload.workspaces,
    pendingInvitations: payload.pendingInvitations
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: string;
      details?: unknown;
    };
    const message = json.error ?? `Request failed with status ${response.status}`;

    if (isRecord(json.details) && typeof json.details.reason === "string") {
      const reason = json.details.reason.trim();
      if (reason && !message.includes(reason)) {
        return `${message} (${reason})`;
      }
    }

    return message;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function syncSessionCookies(
  tokens: SessionTokens,
  persistence: SessionPersistence
): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  await performFetch("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      persistence
    })
  });
}

async function clearSessionCookies(): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  await performFetch("/api/session", {
    method: "DELETE"
  });
}

async function performFetch(
  input: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    throw error;
  }
}

export function getConfiguredApiUrl(): string {
  return API_URL;
}

async function refreshSession(session: AppSession): Promise<AppSession | null> {
  const persistence = readStoredSession()?.persistence ?? "local";
  const response = await performFetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      refreshToken: session.tokens.refreshToken
    })
  });

  if (!response.ok) {
    clearStoredSession();
    return null;
  }

  const json = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  const nextSession: AppSession = {
    ...session,
    tokens: {
      accessToken: json.accessToken,
      refreshToken: json.refreshToken
    }
  };

  storeSession(nextSession, persistence);
  await syncSessionCookies(nextSession.tokens, persistence);
  return nextSession;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  includeWorkspaceHeader = true
): Promise<T> {
  let session = authenticated ? getStoredSession() : null;
  const headers = new Headers(init.headers);

  if (authenticated) {
    if (!session) {
      throw new Error("You must sign in before using the assistant.");
    }

    headers.set("Authorization", `Bearer ${session.tokens.accessToken}`);
    if (includeWorkspaceHeader && session.currentWorkspace?.id) {
      headers.set("X-Workspace-Id", session.currentWorkspace.id);
    }
  }

  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response = await performFetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && authenticated && session) {
    const refreshedSession = await refreshSession(session);
    if (!refreshedSession) {
      throw new Error("Your session expired. Sign in again.");
    }

    headers.set("Authorization", `Bearer ${refreshedSession.tokens.accessToken}`);
    response = await performFetch(`${API_URL}${path}`, {
      ...init,
      headers
    });
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  const body = await response.text();
  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

export async function login(
  payload: AuthPayload,
  options: {
    persistence?: SessionPersistence;
  } = {}
): Promise<AppSession> {
  const response = await requestJson<{
    user: AuthenticatedUser;
    tokens: SessionTokens;
    currentWorkspace?: WorkspaceSummary;
    workspaces?: WorkspaceSummary[];
    pendingInvitations?: WorkspaceInvitation[];
  }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    false
  );

  const session: AppSession = {
    user: response.user,
    tokens: response.tokens,
    currentWorkspace: response.currentWorkspace ?? null,
    workspaces: response.workspaces ?? [],
    pendingInvitations: response.pendingInvitations ?? []
  };
  storeSession(session, options.persistence ?? "local");
  await syncSessionCookies(session.tokens, options.persistence ?? "local");
  return session;
}

export async function register(payload: AuthPayload): Promise<AppSession> {
  const response = await requestJson<{
    user: AuthenticatedUser;
    tokens: SessionTokens;
    currentWorkspace?: WorkspaceSummary;
    workspaces?: WorkspaceSummary[];
    pendingInvitations?: WorkspaceInvitation[];
  }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    false
  );

  const session: AppSession = {
    user: response.user,
    tokens: response.tokens,
    currentWorkspace: response.currentWorkspace ?? null,
    workspaces: response.workspaces ?? [],
    pendingInvitations: response.pendingInvitations ?? []
  };
  storeSession(session);
  await syncSessionCookies(session.tokens, "local");
  return session;
}

export async function restoreStoredSession(): Promise<AppSession | null> {
  const stored = readStoredSession();
  if (!stored) {
    return null;
  }

  try {
    const workspaceSession = await requestJson<WorkspaceSessionPayload>(
      "/workspaces",
      {},
      true,
      false
    );
    const latestSession = getStoredSession() ?? stored.session;
    const nextSession = mergeSessionWithWorkspacePayload(
      latestSession,
      workspaceSession
    );

    storeSession(nextSession, stored.persistence);
    await syncSessionCookies(nextSession.tokens, stored.persistence);
    return nextSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function updateUserPreferences(
  preferences: Record<string, unknown>
): Promise<AuthenticatedUser> {
  const response = await requestJson<{ user: AuthenticatedUser }>("/auth/preferences", {
    method: "PATCH",
    body: JSON.stringify({
      preferences
    })
  });

  const stored = readStoredSession();
  if (stored) {
    storeSession(
      {
        ...stored.session,
        user: response.user
      },
      stored.persistence
    );
  }

  return response.user;
}

export async function listWorkspaceSession(): Promise<WorkspaceSessionPayload> {
  return requestJson<WorkspaceSessionPayload>("/workspaces", {}, true, false);
}

export async function createWorkspace(payload: {
  name: string;
  organizationName?: string;
}): Promise<WorkspaceSessionPayload> {
  return requestJson<WorkspaceSessionPayload>("/workspaces", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function switchWorkspace(
  workspaceId: string
): Promise<WorkspaceSessionPayload> {
  return requestJson<WorkspaceSessionPayload>("/workspaces/switch", {
    method: "POST",
    body: JSON.stringify({
      workspaceId
    })
  });
}

export async function inviteWorkspaceMember(payload: {
  email: string;
  role: WorkspaceRole;
}): Promise<WorkspaceInvitation> {
  const response = await requestJson<{ invitation: WorkspaceInvitation }>(
    "/workspaces/current/invitations",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  return response.invitation;
}

export async function acceptWorkspaceInvitation(
  invitationId: string
): Promise<WorkspaceSessionPayload> {
  return requestJson<WorkspaceSessionPayload>(
    `/workspaces/invitations/${invitationId}/accept`,
    {
      method: "POST"
    }
  );
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await requestJson<{ conversations: ConversationSummary[] }>(
    "/chat/conversations"
  );
  return response.conversations;
}

export async function createConversation(payload: {
  title: string;
  provider: string;
  model: string;
}): Promise<ConversationSummary> {
  const response = await requestJson<{ conversation: ConversationSummary }>(
    "/chat/conversations",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
  return response.conversation;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await requestJson<void>(
    `/chat/conversations/${conversationId}`,
    {
      method: "DELETE"
    }
  );
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const response = await requestJson<{ messages: ChatMessage[] }>(
    `/chat/conversations/${conversationId}/messages`
  );
  return response.messages;
}

export async function listMemoryContext(): Promise<MemoryContext> {
  return requestJson<MemoryContext>("/memory/context");
}

export async function listTools(): Promise<ToolDescriptor[]> {
  const response = await requestJson<{ tools: ToolDescriptor[] }>("/tools");
  return response.tools;
}

export async function listProviders(): Promise<LlmProviderCatalog[]> {
  const response = await requestJson<{ providers: LlmProviderCatalog[] }>(
    "/llm/providers"
  );
  return response.providers;
}

export async function listAgentTasks(limit = 12): Promise<AgentTaskSummary[]> {
  const response = await requestJson<{ tasks: AgentTaskSummary[] }>(
    `/agents/tasks?limit=${limit}`
  );
  return response.tasks;
}

export async function getAgentTask(taskId: string): Promise<AgentTaskDetail> {
  return requestJson<AgentTaskDetail>(`/agents/tasks/${taskId}`);
}

export async function executeAgent(
  payload: ExecuteAgentPayload
): Promise<ExecuteAgentResponse> {
  return requestJson<ExecuteAgentResponse>("/agents/execute", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listEndpointInventory(): Promise<EndpointInventory> {
  return requestJson<EndpointInventory>("/endpoints");
}

export async function createMonitoredEndpoint(
  payload: CreateMonitoredEndpointPayload
): Promise<MonitoredEndpoint> {
  const response = await requestJson<{ endpoint: MonitoredEndpoint }>("/endpoints", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return response.endpoint;
}

export async function discoverLocalEndpoints(): Promise<EndpointInventory> {
  return requestJson<EndpointInventory>("/endpoints/discover", {
    method: "POST"
  });
}

export async function refreshEndpointInventory(): Promise<EndpointInventory> {
  return requestJson<EndpointInventory>("/endpoints/refresh", {
    method: "POST"
  });
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  return requestJson<AdminDashboard>("/admin/dashboard");
}

export async function getAdminNetworkSnapshot(): Promise<AdminNetworkScan> {
  return requestJson<AdminNetworkScan>("/admin/network", {}, true, false);
}

export async function startAdminNetworkScan(): Promise<AdminNetworkJob> {
  const response = await requestJson<{ job: AdminNetworkJob }>(
    "/admin/network/scan",
    {
      method: "POST"
    },
    true,
    false
  );

  return response.job;
}

export async function resolveAdminNetworkNames(): Promise<AdminNetworkJob> {
  const response = await requestJson<{ job: AdminNetworkJob }>(
    "/admin/network/resolve-names",
    {
      method: "POST"
    },
    true,
    false
  );

  return response.job;
}

export async function scanWebsiteSecurity(payload: {
  url: string;
  maxPages?: number;
}): Promise<AdminWebsiteScan> {
  return requestJson<AdminWebsiteScan>("/admin/website-scan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function runSecurityReviewLab(payload: {
  url: string;
  maxPages?: number;
}): Promise<AdminSecurityReviewResult> {
  return requestJson<AdminSecurityReviewResult>("/admin/security-review", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getPrivateModeConfig(): Promise<PrivateModeConfig> {
  const response = await requestJson<{ config: PrivateModeConfig }>(
    "/admin/private-mode/config"
  );
  return response.config;
}

export async function updatePrivateModeConfig(
  payload: Partial<PrivateModeConfig>
): Promise<PrivateModeConfig> {
  const response = await requestJson<{ config: PrivateModeConfig }>(
    "/admin/private-mode/config",
    {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  );
  return response.config;
}

export async function activatePrivateMode(
  payload: Partial<PrivateModeConfig>
): Promise<PrivateModeSession> {
  const response = await requestJson<{ session: PrivateModeSession }>(
    "/admin/private-mode/activate",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
  return response.session;
}

export async function deactivatePrivateMode(sessionId?: string): Promise<void> {
  await requestJson<void>("/admin/private-mode/deactivate", {
    method: "POST",
    body: JSON.stringify({
      sessionId
    })
  });
}

export async function getPrivateModeSession(): Promise<PrivateModeSessionState> {
  return requestJson<PrivateModeSessionState>("/admin/private-mode/session");
}

export async function verifyPrivateMode(): Promise<PrivateModeVerificationResult> {
  const response = await requestJson<{ verification: PrivateModeVerificationResult }>(
    "/admin/private-mode/verify",
    {
      method: "POST"
    }
  );
  return response.verification;
}

export async function leakTestPrivateMode(): Promise<PrivateModeLeakTestResult> {
  const response = await requestJson<{ leakTest: PrivateModeLeakTestResult }>(
    "/admin/private-mode/leak-test",
    {
      method: "POST"
    }
  );
  return response.leakTest;
}

export async function rotatePrivateModeCircuit(
  sessionId?: string
): Promise<PrivateModeCircuitStatus> {
  const response = await requestJson<{ circuit: PrivateModeCircuitStatus }>(
    "/admin/private-mode/rotate",
    {
      method: "POST",
      body: JSON.stringify({
        sessionId
      })
    }
  );
  return response.circuit;
}

export async function listPrivateModeExitLogs(
  limit = 50
): Promise<PrivateModeExitLog[]> {
  const response = await requestJson<{ logs: PrivateModeExitLog[] }>(
    `/admin/private-mode/exit-logs?limit=${limit}`
  );
  return response.logs;
}

export async function startDomainOwnershipVerification(payload: {
  target: string;
  method?: DomainOwnershipVerificationMethod;
  devModeBypass?: boolean;
}): Promise<DomainOwnershipVerificationSummary> {
  const response = await requestJson<{
    verification: DomainOwnershipVerificationSummary;
  }>("/admin/authorized-testing/verifications", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return response.verification;
}

export async function getAuthorizedTestingDevModeStatus(): Promise<AuthorizedTestingDevModeStatus> {
  const response = await requestJson<{
    devMode: AuthorizedTestingDevModeStatus;
  }>("/admin/authorized-testing/dev-mode");

  return response.devMode;
}

export async function listDomainOwnershipVerifications(
  limit = 25
): Promise<DomainOwnershipVerificationSummary[]> {
  const response = await requestJson<{
    verifications: DomainOwnershipVerificationSummary[];
  }>(`/admin/authorized-testing/verifications?limit=${limit}`);

  return response.verifications;
}

export async function checkDomainOwnershipVerification(
  verificationId: string,
  devModeBypass?: boolean
): Promise<DomainOwnershipVerificationSummary> {
  const response = await requestJson<{
    verification: DomainOwnershipVerificationSummary;
  }>(`/admin/authorized-testing/verifications/${verificationId}/check`, {
    method: "POST",
    body: JSON.stringify({
      devModeBypass
    })
  });

  return response.verification;
}

export async function runAuthorizedSecurityTest(payload: {
  verificationId?: string;
  url: string;
  maxPages?: number;
  maxRequests?: number;
  devModeBypass?: boolean;
  modules?: Array<
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
    | "session_management"
  >;
  authProfiles?: Array<{
    name: string;
    role: "anonymous" | "low_privilege" | "high_privilege";
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }>;
  authEndpointDescriptors?: Array<{
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
  }>;
  manualFormValidation?: {
    rateLimitPerMinute?: number;
    credentialLabels?: string[];
    notes?: string;
  };
}): Promise<AuthorizedSecurityTestReport> {
  const report = await requestJson<AuthorizedSecurityTestReport>(
    "/admin/authorized-testing/runs",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  return normalizeAuthorizedSecurityTestReport(report);
}

export async function listAuthorizedSecurityTestRuns(
  limit = 20
): Promise<AuthorizedSecurityTestRunSummary[]> {
  const response = await requestJson<{
    runs: AuthorizedSecurityTestRunSummary[];
  }>(`/admin/authorized-testing/runs?limit=${limit}`);

  return response.runs;
}

export async function getAuthorizedSecurityTestRun(
  runId: string
): Promise<AuthorizedSecurityTestReport> {
  const report = await requestJson<AuthorizedSecurityTestReport>(
    `/admin/authorized-testing/runs/${runId}`
  );

  return normalizeAuthorizedSecurityTestReport(report);
}

export async function listAdvancedPenetrationTestRuns(
  limit = 20
): Promise<AdvancedPenetrationTestRunSummary[]> {
  const response = await requestJson<{
    runs: AdvancedPenetrationTestRunSummary[];
  }>(`/admin/authorized-testing/advanced-runs?limit=${limit}`);

  return response.runs;
}

export async function getAdvancedPenetrationTestRun(
  runId: string
): Promise<AdvancedPenetrationTestRunDetail> {
  const response = await requestJson<{
    run: AdvancedPenetrationTestRunDetail;
  }>(`/admin/authorized-testing/advanced-runs/${runId}`);

  return response.run;
}

export async function getAdvancedPenetrationTestReport(
  runId: string
): Promise<Record<string, unknown>> {
  const response = await requestJson<{
    report: Record<string, unknown>;
  }>(`/admin/authorized-testing/advanced-runs/${runId}/report`);

  return response.report;
}

interface StreamAdvancedPenetrationTestInput {
  target: string;
  verificationId: string;
  maxPages?: number;
  maxRequests?: number;
  conversationId?: string;
  authProfiles?: Array<{
    name: string;
    role: "anonymous" | "low_privilege" | "high_privilege";
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }>;
  authEndpointDescriptors?: Array<{
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
  }>;
  manualFormValidation?: {
    rateLimitPerMinute?: number;
    credentialLabels?: string[];
    notes?: string;
  };
  onEvent: (event: string, data: unknown) => void;
}

export async function streamAdvancedPenetrationTest(
  input: StreamAdvancedPenetrationTestInput
): Promise<void> {
  let session = getStoredSession();
  if (!session) {
    throw new Error("You must sign in before using the assistant.");
  }

  const makeRequest = async (accessToken: string) =>
    performFetch(`${API_URL}/admin/authorized-testing/advanced-runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(session?.currentWorkspace?.id
          ? {
              "X-Workspace-Id": session.currentWorkspace.id
            }
          : {})
      },
      body: JSON.stringify({
        target: input.target,
        verificationId: input.verificationId,
        maxPages: input.maxPages,
        maxRequests: input.maxRequests,
        conversationId: input.conversationId,
        authProfiles: input.authProfiles,
        authEndpointDescriptors: input.authEndpointDescriptors,
        manualFormValidation: input.manualFormValidation
      })
    });

  let response = await makeRequest(session.tokens.accessToken);

  if (response.status === 401) {
    const refreshedSession = await refreshSession(session);
    if (!refreshedSession) {
      throw new Error("Your session expired. Sign in again.");
    }

    session = refreshedSession;
    response = await makeRequest(refreshedSession.tokens.accessToken);
  }

  if (!response.ok || !response.body) {
    throw new Error(await parseError(response));
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() ?? "";

    for (const block of eventBlocks) {
      const lines = block.split("\n");
      const eventName =
        lines.find((line) => line.startsWith("event: "))?.slice(7).trim() ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");

      if (!data) {
        continue;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(data) as unknown;
      } catch {
        continue;
      }

      input.onEvent(eventName, payload);

      if (eventName === "error") {
        const errorPayload =
          payload && typeof payload === "object"
            ? (payload as { error?: string })
            : undefined;
        throw new Error(
          errorPayload?.error ?? "Advanced penetration test stream failed."
        );
      }

      if (eventName === "finished") {
        return;
      }
    }
  }
}

export function createAdminNetworkWebSocketUrl(): string {
  const session = getStoredSession();
  if (!session) {
    throw new Error("You must sign in before using the assistant.");
  }

  const baseUrl = new URL(API_URL);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/admin/network/ws`;
  baseUrl.searchParams.set("access_token", session.tokens.accessToken);
  return baseUrl.toString();
}

export interface PolicyRulePayload {
  id?: string;
  category: string;
  decision: string;
  enabled?: boolean;
  priority?: number;
  description?: string;
  toolNames?: string[];
  roleScopes?: string[];
  workspaceRoleScopes?: string[];
  modelPatterns?: string[];
  conditions?: {
    contentPatterns?: string[];
    urlHosts?: string[];
    urlNotHosts?: string[];
    fileExtensions?: string[];
    maxFileSizeBytes?: number;
    metadataEquals?: Record<string, string | number | boolean>;
  };
}

export interface PolicyAssignmentPayload {
  id?: string;
  scopeType: string;
  scopeId?: string;
  assignmentType?: string;
  mode?: PolicyMode;
  priority?: number;
  isActive?: boolean;
}

export interface PolicyUpsertPayload {
  name: string;
  description?: string;
  mode?: PolicyMode;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  rules: PolicyRulePayload[];
  assignments: PolicyAssignmentPayload[];
}

export async function getPolicies(): Promise<PolicyCatalog> {
  return requestJson<PolicyCatalog>("/admin/policies");
}

export async function createPolicy(
  payload: PolicyUpsertPayload
): Promise<PolicyCatalog["policies"][number]> {
  const response = await requestJson<{ policy: PolicyCatalog["policies"][number] }>(
    "/admin/policies",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  return response.policy;
}

export async function updatePolicy(
  policyId: string,
  payload: PolicyUpsertPayload
): Promise<PolicyCatalog["policies"][number]> {
  const response = await requestJson<{ policy: PolicyCatalog["policies"][number] }>(
    `/admin/policies/${policyId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  );

  return response.policy;
}

export async function deletePolicy(policyId: string): Promise<void> {
  await requestJson<void>(`/admin/policies/${policyId}`, {
    method: "DELETE"
  });
}

export async function evaluatePolicy(payload: {
  action: string;
  categories: string[];
  toolName?: string;
  model?: string;
  provider?: string;
  content?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sql?: string;
  metadata?: Record<string, unknown>;
  roleOverride?: string;
  workspaceRoleOverride?: WorkspaceRole;
}): Promise<PolicyEvaluationResult> {
  return requestJson<PolicyEvaluationResult>("/admin/policies/evaluate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getPolicyAuditLogs(limit = 100): Promise<PolicyAuditLog[]> {
  const response = await requestJson<{ logs: PolicyAuditLog[] }>(
    `/admin/policies/audit-logs?limit=${limit}`
  );
  return response.logs;
}

export async function setWorkspacePolicyMode(payload: {
  mode: PolicyMode;
  policyId?: string;
}): Promise<PolicyMode> {
  const response = await requestJson<{ mode: PolicyMode }>(
    "/admin/policies/workspace-mode",
    {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  );
  return response.mode;
}

interface StreamConversationInput {
  conversationId: string;
  content: string;
  provider: string;
  model: string;
  onToken: (delta: string) => void;
}

export async function streamConversation(input: StreamConversationInput): Promise<void> {
  let session = getStoredSession();
  if (!session) {
    throw new Error("You must sign in before sending a message.");
  }

  const makeRequest = async (accessToken: string) =>
    performFetch(`${API_URL}/chat/conversations/${input.conversationId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(session?.currentWorkspace?.id
          ? {
              "X-Workspace-Id": session.currentWorkspace.id
            }
          : {})
      },
      body: JSON.stringify({
        content: input.content,
        provider: input.provider,
        model: input.model
      })
    });

  let response = await makeRequest(session.tokens.accessToken);

  if (response.status === 401) {
    const refreshedSession = await refreshSession(session);
    if (!refreshedSession) {
      throw new Error("Your session expired. Sign in again.");
    }

    session = refreshedSession;
    response = await makeRequest(refreshedSession.tokens.accessToken);
  }

  if (!response.ok || !response.body) {
    throw new Error(await parseError(response));
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() ?? "";

    for (const block of eventBlocks) {
      const lines = block.split("\n");
      const eventName =
        lines.find((line) => line.startsWith("event: "))?.slice(7).trim() ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");

      if (!data) {
        continue;
      }

      let payload: {
        delta?: string;
        done?: boolean;
        error?: string;
      };

      try {
        payload = JSON.parse(data) as {
          delta?: string;
          done?: boolean;
        };
      } catch {
        continue;
      }

      if (eventName === "token" && payload.delta) {
        input.onToken(payload.delta);
      }

      if (eventName === "error") {
        throw new Error(payload.error ?? "Streaming request failed.");
      }

      if (eventName === "done" || payload.done) {
        receivedDone = true;
        return;
      }
    }
  }

  if (!receivedDone) {
    throw new Error("Streaming response ended before completion.");
  }
}
