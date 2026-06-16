"use client";

import {
  AgentDefinition,
  AgentExecutionResult,
  AgentTaskDetail,
  AgentTaskPlanStep,
  AgentTaskSummary,
  AdminDashboard,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";
const SESSION_STORAGE_KEY = "security-ai-lab.session";

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

interface AuthPayload {
  username: string;
  password: string;
}

interface WorkspaceSessionPayload {
  currentWorkspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitation[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredSession(): AppSession | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    return {
      user: parsed.user as AuthenticatedUser,
      tokens: parsed.tokens as SessionTokens,
      currentWorkspace: parsed.currentWorkspace ?? null,
      workspaces: parsed.workspaces ?? [],
      pendingInvitations: parsed.pendingInvitations ?? []
    };
  } catch {
    return null;
  }
}

export function storeSession(session: AppSession): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function refreshSession(session: AppSession): Promise<AppSession | null> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
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

  storeSession(nextSession);
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

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && authenticated && session) {
    const refreshedSession = await refreshSession(session);
    if (!refreshedSession) {
      throw new Error("Your session expired. Sign in again.");
    }

    headers.set("Authorization", `Bearer ${refreshedSession.tokens.accessToken}`);
    response = await fetch(`${API_URL}${path}`, {
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

export async function login(payload: AuthPayload): Promise<AppSession> {
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
  storeSession(session);
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
  return session;
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

export async function getAdminDashboard(): Promise<AdminDashboard> {
  return requestJson<AdminDashboard>("/admin/dashboard");
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
    fetch(`${API_URL}/chat/conversations/${input.conversationId}/stream`, {
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
