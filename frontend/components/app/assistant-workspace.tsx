"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, startTransition } from "react";

import {
  AppSession,
  clearStoredSession,
  createConversation,
  getStoredSession,
  listConversations,
  listMemoryContext,
  listMessages,
  listProviders,
  listTools,
  streamConversation
} from "@/lib/api";
import {
  ChatMessage,
  ConversationSummary,
  LlmProviderCatalog,
  MemoryItem,
  ToolDescriptor
} from "@/lib/types";
import { MetricsGrid } from "@/components/admin/metrics-grid";
import { ChatShell } from "@/components/chat/chat-shell";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";

function buildConversationTitle(content: string) {
  return content.trim().slice(0, 48) || "New Session";
}

function createOptimisticMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${role}-${Date.now()}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

export function AssistantWorkspace() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providers, setProviders] = useState<LlmProviderCatalog[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("qwen");
  const [selectedModel, setSelectedModel] = useState("qwen2.5-coder");
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const availableModels = useMemo(() => {
    return providers.find((provider) => provider.id === selectedProvider)?.models ?? [];
  }, [providers, selectedProvider]);

  useEffect(() => {
    const storedSession = getStoredSession();
    setSession(storedSession);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!session) {
      setIsLoading(false);
      return;
    }

    void bootstrap();
  }, [isHydrated, session]);

  useEffect(() => {
    if (!availableModels.length) {
      return;
    }

    if (!availableModels.includes(selectedModel)) {
      setSelectedModel(availableModels[0]!);
    }
  }, [availableModels, selectedModel]);

  async function bootstrap() {
    setIsLoading(true);
    setError(null);

    try {
      const [providerList, toolList, memoryContext, conversationList] = await Promise.all([
        listProviders(),
        listTools(),
        listMemoryContext(),
        listConversations()
      ]);

      setProviders(providerList);
      if (providerList.length > 0) {
        setSelectedProvider(providerList[0]!.id);
        setSelectedModel(providerList[0]!.models[0] ?? selectedModel);
      }

      setTools(toolList);
      setMemoryItems([
        ...memoryContext.preferences.slice(0, 3),
        ...memoryContext.longTerm.slice(0, 3),
        ...memoryContext.shortTerm.slice(0, 2).map((message, index) => ({
          id: message.id,
          memoryType: "short_term" as const,
          key: `recent_${index + 1}`,
          value: message.content
        }))
      ]);
      setConversations(conversationList);

      if (conversationList.length > 0) {
        const firstConversation = conversationList[0]!;
        setSelectedConversationId(firstConversation.id);
        setSelectedProvider(firstConversation.modelProvider);
        setSelectedModel(firstConversation.modelName);
        const conversationMessages = await listMessages(firstConversation.id);
        setMessages(conversationMessages);
      } else {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (bootstrapError) {
      const message =
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Failed to initialize the assistant workspace.";
      setError(message);

      if (message.toLowerCase().includes("session")) {
        clearStoredSession();
        setSession(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshConversationsState(nextSelectedId?: string) {
    const conversationList = await listConversations();
    setConversations(conversationList);

    const selectedId =
      nextSelectedId ??
      selectedConversationId ??
      conversationList[0]?.id ??
      null;

    if (selectedId) {
      const current = conversationList.find((conversation) => conversation.id === selectedId);
      if (current) {
        setSelectedProvider(current.modelProvider);
        setSelectedModel(current.modelName);
      }
    }
  }

  async function refreshMemoryState() {
    const memoryContext = await listMemoryContext();
    setMemoryItems([
      ...memoryContext.preferences.slice(0, 3),
      ...memoryContext.longTerm.slice(0, 3),
      ...memoryContext.shortTerm.slice(0, 2).map((message, index) => ({
        id: message.id,
        memoryType: "short_term" as const,
        key: `recent_${index + 1}`,
        value: message.content
      }))
    ]);
  }

  async function handleSelectConversation(conversationId: string) {
    setError(null);
    setIsLoadingMessages(true);
    startTransition(() => {
      setSelectedConversationId(conversationId);
    });

    try {
      const conversationMessages = await listMessages(conversationId);
      const selected = conversations.find((conversation) => conversation.id === conversationId);
      if (selected) {
        setSelectedProvider(selected.modelProvider);
        setSelectedModel(selected.modelName);
      }
      setMessages(conversationMessages);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Failed to load conversation."
      );
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleCreateConversation(seedContent?: string) {
    const conversation = await createConversation({
      title: seedContent ? buildConversationTitle(seedContent) : "New Session",
      provider: selectedProvider,
      model: selectedModel
    });

    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setSelectedConversationId(conversation.id);
    return conversation;
  }

  async function handleSendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    setError(null);
    setIsStreaming(true);

    let conversationId = selectedConversationId;
    const userMessage = createOptimisticMessage("user", trimmed);
    const assistantMessage = createOptimisticMessage("assistant", "");

    try {
      if (!conversationId) {
        const conversation = await handleCreateConversation(trimmed);
        conversationId = conversation.id;
      }

      setMessages((current) => [...current, userMessage, assistantMessage]);

      let assistantContent = "";
      await streamConversation({
        conversationId,
        content: trimmed,
        provider: selectedProvider,
        model: selectedModel,
        onToken: (delta) => {
          assistantContent += delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: assistantContent
                  }
                : message
            )
          );
        }
      });

      await Promise.all([
        refreshConversationsState(conversationId),
        refreshMemoryState()
      ]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message send failed.");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content:
                  sendError instanceof Error
                    ? `Request failed: ${sendError.message}`
                    : "Request failed."
              }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    setConversations([]);
    setMessages([]);
    setMemoryItems([]);
    setTools([]);
    setSelectedConversationId(null);
  }

  if (!isHydrated || isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(217,108,50,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(37,68,59,0.18),_transparent_22%),linear-gradient(180deg,_#ece6dc_0%,_#e7ebe2_52%,_#dbe2d5_100%)] px-4 py-6 md:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Card className="bg-white/70 p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-black/50">
              Bootstrapping
            </p>
            <h1 className="mt-3 text-4xl font-semibold text-ink">
              Connecting the assistant workspace
            </h1>
            <p className="mt-4 text-sm text-black/65">
              The frontend is loading your session, provider catalog, tools, and conversations.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(217,108,50,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(37,68,59,0.18),_transparent_22%),linear-gradient(180deg,_#ece6dc_0%,_#e7ebe2_52%,_#dbe2d5_100%)] px-4 py-6 md:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Card className="bg-white/75 p-10">
            <p className="text-xs uppercase tracking-[0.22em] text-black/50">Authentication Required</p>
            <h1 className="mt-3 text-4xl font-semibold text-ink">
              Sign in before using live chat
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-black/65">
              The shell is built, but live conversation, memory, provider, and tool data require a JWT session.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/login"
                className="rounded-full bg-pine px-5 py-3 text-sm font-semibold text-sand transition hover:bg-pine/90"
              >
                Go to Login
              </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(217,108,50,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(37,68,59,0.18),_transparent_22%),linear-gradient(180deg,_#ece6dc_0%,_#e7ebe2_52%,_#dbe2d5_100%)] px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1600px] gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Sidebar
          userName={session.user.displayName}
          userEmail={session.user.email}
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onCreateConversation={() => {
            void handleCreateConversation();
          }}
        />
        <div className="space-y-6">
          <Topbar
            userName={session.user.displayName}
            providerCount={providers.length}
            conversationCount={conversations.length}
            onLogout={handleLogout}
          />
          <MetricsGrid />
          <ChatShell
            conversationTitle={selectedConversation?.title ?? "New Session"}
            messages={messages}
            pending={isStreaming || isLoadingMessages}
            error={error}
            providers={providers}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onProviderChange={setSelectedProvider}
            onModelChange={setSelectedModel}
            onSend={handleSendMessage}
            memoryItems={memoryItems}
            tools={tools}
          />
        </div>
      </div>
    </main>
  );
}
