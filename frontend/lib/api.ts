"use client";

import {
  AuthenticatedUser,
  ChatMessage,
  ConversationSummary,
  LlmProviderCatalog,
  MemoryContext,
  ToolDescriptor
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
}

interface AuthPayload {
  email: string;
  password: string;
  displayName?: string;
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
    return JSON.parse(raw) as AppSession;
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
  authenticated = true
): Promise<T> {
  let session = authenticated ? getStoredSession() : null;
  const headers = new Headers(init.headers);

  if (authenticated) {
    if (!session) {
      throw new Error("You must sign in before using the assistant.");
    }

    headers.set("Authorization", `Bearer ${session.tokens.accessToken}`);
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

  return (await response.json()) as T;
}

export async function login(payload: AuthPayload): Promise<AppSession> {
  const response = await requestJson<{
    user: AuthenticatedUser;
    tokens: SessionTokens;
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
    tokens: response.tokens
  };
  storeSession(session);
  return session;
}

export async function register(payload: AuthPayload): Promise<AppSession> {
  const response = await requestJson<{
    user: AuthenticatedUser;
    tokens: SessionTokens;
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
    tokens: response.tokens
  };
  storeSession(session);
  return session;
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
        Authorization: `Bearer ${accessToken}`
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

      if (eventName === "done" || payload.done) {
        return;
      }
    }
  }
}
