"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Menu, Settings2, X } from "lucide-react";

import {
  acceptWorkspaceInvitation,
  AppSession,
  clearStoredSession,
  createConversation,
  createWorkspace as createWorkspaceSession,
  deleteConversation,
  executeAgent,
  getAgentTask,
  getStoredSession,
  inviteWorkspaceMember,
  listAgentTasks,
  listConversations,
  listMemoryContext,
  listMessages,
  listProviders,
  listWorkspaceSession,
  listTools,
  storeSession,
  streamConversation,
  switchWorkspace as switchWorkspaceSession
} from "@/lib/api";
import {
  AgentTaskDetail,
  AgentTaskSummary,
  ChatMessage,
  ConversationSummary,
  LlmProviderCatalog,
  MemoryItem,
  ToolDescriptor,
  WorkspaceInvitation,
  WorkspaceSummary
} from "@/lib/types";
import {
  ChatShell,
  WorkspaceView
} from "@/components/chat/chat-shell";
import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceSettingsPanel } from "@/components/layout/workspace-settings-panel";
import { AppIdentity } from "@/components/ui/app-identity";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/branding";

function buildConversationTitle(content: string) {
  return content.trim().slice(0, 48) || "New Chat";
}

function buildAgentTaskTitle(objective: string) {
  return objective.trim().slice(0, 52) || "Agent Task";
}

const DEFAULT_AGENT_INSTRUCTIONS =
  `You are the ${APP_NAME} task operator. Prefer tool-assisted execution when it improves accuracy, keep outputs concise, and focus on actionable engineering results.`;

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

function isTaskActive(status?: AgentTaskSummary["status"]): boolean {
  return status === "queued" || status === "running";
}

function selectProviderCatalog(
  providers: LlmProviderCatalog[],
  preferredProvider?: string | null
): LlmProviderCatalog | null {
  return (
    providers.find(
      (provider) => provider.id === preferredProvider && provider.models.length > 0
    ) ??
    providers.find((provider) => provider.models.length > 0) ??
    providers[0] ??
    null
  );
}

function selectModelName(
  provider: LlmProviderCatalog | null,
  preferredModel?: string | null
): string {
  if (!provider) {
    return "";
  }

  if (preferredModel && provider.models.includes(preferredModel)) {
    return preferredModel;
  }

  return provider.models[0] ?? "";
}

interface AssistantWorkspaceProps {
  conversationId?: string | null;
}

export function AssistantWorkspace({
  conversationId: routeConversationId = null
}: AssistantWorkspaceProps) {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providers, setProviders] = useState<LlmProviderCatalog[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("qwen");
  const [selectedModel, setSelectedModel] = useState("");
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceSummary | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([]);
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<AgentTaskDetail | null>(null);
  const [agentObjective, setAgentObjective] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [isLoadingTaskDetail, setIsLoadingTaskDetail] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const [workspacePanelSection, setWorkspacePanelSection] = useState<
    "workspace" | "profile"
  >("workspace");
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const pollingTaskIdRef = useRef<string | null>(null);

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
    setCurrentWorkspace(storedSession?.currentWorkspace ?? null);
    setWorkspaces(storedSession?.workspaces ?? []);
    setPendingInvitations(storedSession?.pendingInvitations ?? []);
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

    void bootstrapWorkspace();
  }, [isHydrated, session]);

  useEffect(() => {
    if (!isHydrated || !session || isLoading) {
      return;
    }

    void loadConversationFromRoute(routeConversationId);
  }, [routeConversationId, isHydrated, isLoading, providers, session]);

  useEffect(() => {
    if (!availableModels.length) {
      setSelectedModel("");
      return;
    }

    if (!availableModels.includes(selectedModel)) {
      setSelectedModel(availableModels[0]!);
    }
  }, [availableModels, selectedModel]);

  useEffect(() => {
    if (tools.length === 0) {
      return;
    }

    setSelectedToolNames((current) =>
      current.length > 0 ? current : tools.map((tool) => tool.name)
    );
  }, [tools]);

  useEffect(() => {
    const taskId = selectedTaskId;
    const status = selectedTaskDetail?.task.status;

    if (!taskId || !isTaskActive(status)) {
      pollingTaskIdRef.current = null;
      return;
    }

    pollingTaskIdRef.current = taskId;

    const timer = window.setTimeout(() => {
      void pollTask(taskId);
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedTaskId, selectedTaskDetail?.task.status]);

  async function bootstrapWorkspace() {
    setIsLoading(true);
    setError(null);
    setAgentError(null);

    try {
      const workspaceSession = await listWorkspaceSession();
      applyWorkspaceSession(workspaceSession);

      const [providerList, toolList, memoryContext, conversationList] = await Promise.all([
        listProviders(),
        listTools(),
        listMemoryContext(),
        listConversations()
      ]);

      setProviders(providerList);
      const providerSelection = selectProviderCatalog(providerList, selectedProvider);
      if (providerSelection) {
        setSelectedProvider(providerSelection.id);
        setSelectedModel(selectModelName(providerSelection, selectedModel));
      }

      setTools(toolList);
      setSelectedToolNames((current) =>
        current.length > 0 ? current : toolList.map((tool) => tool.name)
      );
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

      try {
        const taskList = await listAgentTasks();
        setAgentTasks(taskList);

        if (taskList.length > 0) {
          const firstTaskId = taskList[0]!.id;
          setSelectedTaskId(firstTaskId);
          setSelectedTaskDetail(await getAgentTask(firstTaskId));
        } else {
          setSelectedTaskId(null);
          setSelectedTaskDetail(null);
        }
      } catch (taskError) {
        setAgentError(
          taskError instanceof Error ? taskError.message : "Failed to load agent tasks."
        );
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

  function applyWorkspaceSession(payload: {
    currentWorkspace: WorkspaceSummary;
    workspaces: WorkspaceSummary[];
    pendingInvitations: WorkspaceInvitation[];
  }) {
    setCurrentWorkspace(payload.currentWorkspace);
    setWorkspaces(payload.workspaces);
    setPendingInvitations(payload.pendingInvitations);

    if (!session) {
      return;
    }

    const nextSession: AppSession = {
      ...session,
      user: {
        ...session.user,
        currentWorkspaceId: payload.currentWorkspace.id
      },
      currentWorkspace: payload.currentWorkspace,
      workspaces: payload.workspaces,
      pendingInvitations: payload.pendingInvitations
    };

    storeSession(nextSession);
  }

  async function loadConversationFromRoute(conversationId: string | null) {
    if (!conversationId) {
      setSelectedConversationId(null);
      setMessages([]);
      setError(null);
      return;
    }

    const selected = conversations.find((conversation) => conversation.id === conversationId);
    if (!selected) {
      setSelectedConversationId(null);
      setMessages([]);
      setError("Conversation not found.");
      return;
    }

    setIsLoadingMessages(true);
    setError(null);
    setSelectedConversationId(selected.id);

    const providerSelection = selectProviderCatalog(providers, selected.modelProvider);
    if (providerSelection) {
      setSelectedProvider(providerSelection.id);
      setSelectedModel(selectModelName(providerSelection, selected.modelName));
    } else {
      setSelectedProvider(selected.modelProvider);
      setSelectedModel(selected.modelName);
    }

    try {
      const conversationMessages = await listMessages(selected.id);
      setMessages(conversationMessages);
    } catch (messageError) {
      setMessages([]);
      setError(
        messageError instanceof Error
          ? messageError.message
          : "Failed to load conversation messages."
      );
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function refreshConversationsState(nextSelectedId?: string) {
    const conversationList = await listConversations();
    setConversations(conversationList);

    const selectedId = nextSelectedId ?? selectedConversationId;

    if (selectedId) {
      const current = conversationList.find((conversation) => conversation.id === selectedId);
      if (current) {
        const providerSelection = selectProviderCatalog(providers, current.modelProvider);
        if (providerSelection) {
          setSelectedProvider(providerSelection.id);
          setSelectedModel(selectModelName(providerSelection, current.modelName));
        }
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

  async function refreshTasksState(nextSelectedId?: string) {
    const taskList = await listAgentTasks();
    setAgentTasks(taskList);

    const selectedId = nextSelectedId ?? selectedTaskId ?? taskList[0]?.id ?? null;

    if (!selectedId) {
      setSelectedTaskId(null);
      setSelectedTaskDetail(null);
      return;
    }

    setSelectedTaskId(selectedId);

    const taskDetail = await getAgentTask(selectedId);
    setSelectedTaskDetail(taskDetail);
  }

  async function pollTask(taskId: string) {
    if (pollingTaskIdRef.current !== taskId) {
      return;
    }

    try {
      const taskDetail = await getAgentTask(taskId);
      setSelectedTaskDetail(taskDetail);
      setAgentTasks((current) => {
        const next = current.map((task) =>
          task.id === taskDetail.task.id ? taskDetail.task : task
        );

        return next.some((task) => task.id === taskDetail.task.id)
          ? next
          : [taskDetail.task, ...next];
      });

      if (!isTaskActive(taskDetail.task.status)) {
        pollingTaskIdRef.current = null;
      }
    } catch (taskError) {
      setAgentError(
        taskError instanceof Error ? taskError.message : "Failed to refresh running task."
      );
      pollingTaskIdRef.current = null;
    }
  }

  async function handleSelectConversation(conversationId: string) {
    setIsNavigationOpen(false);
    setActiveView("chat");

    if (conversationId === routeConversationId) {
      return;
    }

    startTransition(() => {
      router.push(`/c/${conversationId}`);
    });
  }

  async function handleSelectTask(taskId: string) {
    setAgentError(null);
    setIsLoadingTaskDetail(true);
    setActiveView("tasks");
    startTransition(() => {
      setSelectedTaskId(taskId);
    });

    try {
      const taskDetail = await getAgentTask(taskId);
      setSelectedTaskDetail(taskDetail);
    } catch (taskError) {
      setAgentError(
        taskError instanceof Error ? taskError.message : "Failed to load task detail."
      );
    } finally {
      setIsLoadingTaskDetail(false);
    }
  }

  function handleToggleTool(toolName: string) {
    setSelectedToolNames((current) =>
      current.includes(toolName)
        ? current.filter((name) => name !== toolName)
        : [...current, toolName]
    );
  }

  async function handleRefreshTasks() {
    setAgentError(null);
    setIsLoadingTaskDetail(true);

    try {
      await refreshTasksState();
    } catch (taskError) {
      setAgentError(
        taskError instanceof Error ? taskError.message : "Failed to refresh agent tasks."
      );
    } finally {
      setIsLoadingTaskDetail(false);
    }
  }

  async function handleCreateConversation(seedContent?: string) {
    const conversation = await createConversation({
      title: seedContent ? buildConversationTitle(seedContent) : "New Chat",
      provider: selectedProvider,
      model: selectedModel
    });

    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setSelectedConversationId(conversation.id);
    return conversation;
  }

  function handleStartNewChat() {
    setError(null);
    setIsNavigationOpen(false);
    setIsWorkspaceOpen(false);
    setActiveView("chat");
    setSelectedConversationId(null);
    setMessages([]);
    startTransition(() => {
      router.push("/");
    });
  }

  async function handleDeleteConversation(conversationId: string) {
    const target = conversations.find((conversation) => conversation.id === conversationId);
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete "${target?.title ?? "this chat"}"? This will remove its messages permanently.`
          );

    if (!confirmed) {
      return;
    }

    setDeletingConversationId(conversationId);
    setError(null);

    try {
      await deleteConversation(conversationId);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId)
      );

      if (selectedConversationId === conversationId || routeConversationId === conversationId) {
        setSelectedConversationId(null);
        setMessages([]);
        startTransition(() => {
          router.push("/");
        });
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete conversation."
      );
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function handleRunAgent() {
    const objective = agentObjective.trim();
    if (!objective || isRunningAgent) {
      return;
    }

    if (selectedToolNames.length === 0) {
      setAgentError("Select at least one tool before launching an agent task.");
      return;
    }

    setAgentError(null);
    setIsRunningAgent(true);
    setActiveView("agents");

    try {
      const result = await executeAgent({
        name: buildAgentTaskTitle(objective),
        description: "Tool-assisted workspace task",
        instructions: DEFAULT_AGENT_INSTRUCTIONS,
        enabledTools: selectedToolNames,
        objective,
        conversationId: selectedConversationId ?? undefined
      });

      setAgentTasks((current) => [
        result.task,
        ...current.filter((task) => task.id !== result.task.id)
      ]);
      setSelectedTaskId(result.task.id);
      setSelectedTaskDetail({
        task: result.task,
        toolExecutions: result.toolExecutions
      });
      pollingTaskIdRef.current = result.task.id;
      setAgentObjective("");
    } catch (runError) {
      setAgentError(runError instanceof Error ? runError.message : "Agent execution failed.");
    } finally {
      setIsRunningAgent(false);
    }
  }

  async function handleSwitchWorkspace(workspaceId: string) {
    if (!currentWorkspace || workspaceId === currentWorkspace.id) {
      return;
    }

    setError(null);
    setSelectedConversationId(null);
    setMessages([]);
    setSelectedTaskId(null);
    setSelectedTaskDetail(null);

    try {
      const workspaceSession = await switchWorkspaceSession(workspaceId);
      applyWorkspaceSession(workspaceSession);
      setIsWorkspaceOpen(false);
      setActiveView("chat");
      startTransition(() => {
        router.push("/");
      });
      await bootstrapWorkspace();
    } catch (workspaceError) {
      setError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to switch workspace."
      );
    }
  }

  async function handleCreateWorkspace() {
    const name =
      typeof window === "undefined"
        ? ""
        : window.prompt("Workspace name", `${session?.user.displayName ?? "New"} Workspace`) ?? "";
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const organizationName =
      typeof window === "undefined"
        ? undefined
        : window.prompt("Organization name (optional)", `${trimmedName} Organization`) ?? undefined;

    setError(null);

    try {
      const workspaceSession = await createWorkspaceSession({
        name: trimmedName,
        organizationName: organizationName?.trim() || undefined
      });
      applyWorkspaceSession(workspaceSession);
      setIsWorkspaceOpen(false);
      setActiveView("chat");
      startTransition(() => {
        router.push("/");
      });
      await bootstrapWorkspace();
    } catch (workspaceError) {
      setError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to create workspace."
      );
    }
  }

  async function handleInviteMember() {
    const email =
      typeof window === "undefined" ? "" : window.prompt("Invite member email", "") ?? "";
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      return;
    }

    const roleInput =
      typeof window === "undefined"
        ? "member"
        : window.prompt("Workspace role: owner, admin, member, or viewer", "member") ?? "member";
    const normalizedRole = roleInput.trim().toLowerCase();
    const role =
      normalizedRole === "owner" ||
      normalizedRole === "admin" ||
      normalizedRole === "viewer"
        ? normalizedRole
        : "member";

    setError(null);

    try {
      const invitation = await inviteWorkspaceMember({
        email: normalizedEmail,
        role
      });

      const tokenNotice = invitation.invitationToken
        ? ` Invitation token: ${invitation.invitationToken}`
        : "";

      if (typeof window !== "undefined") {
        window.alert(`Invitation created for ${invitation.email}.${tokenNotice}`);
      }
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : "Failed to invite member."
      );
    }
  }

  async function handleAcceptInvitation(invitationId: string) {
    setError(null);

    try {
      const workspaceSession = await acceptWorkspaceInvitation(invitationId);
      applyWorkspaceSession(workspaceSession);
      setIsWorkspaceOpen(false);
      setActiveView("chat");
      startTransition(() => {
        router.push("/");
      });
      await bootstrapWorkspace();
    } catch (invitationError) {
      setError(
        invitationError instanceof Error
          ? invitationError.message
          : "Failed to accept invitation."
      );
    }
  }

  async function handleSendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    if (!availableModels.includes(selectedModel)) {
      setError(`No installed local model is available for provider '${selectedProvider}'.`);
      return;
    }

    setError(null);
    setIsStreaming(true);
    setActiveView("chat");

    let conversationId = selectedConversationId;
    let createdConversationId: string | null = null;
    const userMessage = createOptimisticMessage("user", trimmed);
    const assistantMessage = createOptimisticMessage("assistant", "");

    try {
      if (!conversationId) {
        const conversation = await handleCreateConversation(trimmed);
        conversationId = conversation.id;
        createdConversationId = conversation.id;
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

      await Promise.all([refreshConversationsState(conversationId), refreshMemoryState()]);

      if (createdConversationId) {
        startTransition(() => {
          router.replace(`/c/${createdConversationId}`);
        });
      }
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

      if (createdConversationId) {
        startTransition(() => {
          router.replace(`/c/${createdConversationId}`);
        });
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    setIsNavigationOpen(false);
    setIsWorkspaceOpen(false);
    setActiveView("chat");
    setConversations([]);
    setMessages([]);
    setMemoryItems([]);
    setTools([]);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setPendingInvitations([]);
    setSelectedToolNames([]);
    setAgentTasks([]);
    setSelectedTaskId(null);
    setSelectedTaskDetail(null);
    setAgentObjective("");
    pollingTaskIdRef.current = null;
    setSelectedConversationId(null);
    startTransition(() => {
      router.push("/login");
    });
  }

  function openWorkspacePanel(section: "workspace" | "profile" = "workspace") {
    setWorkspacePanelSection(section);
    setIsNavigationOpen(false);
    setIsWorkspaceOpen(true);
  }

  if (!isHydrated || isLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Card className="p-10">
            <AppIdentity size="lg" />
            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.22em] text-black/40">
              Bootstrapping
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#111827]">
              Connecting {APP_NAME}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-black/60">
              Loading your session, model catalog, tools, memory, and conversations.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 md:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="p-10">
            <AppIdentity size="lg" />
            <h1 className="mt-10 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[#111827] md:text-5xl">
              Operate models, tools, memory, and agent tasks from one secure interface.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-black/60">
              Cognexa is built for local-first teams that need a clean control surface for
              engineering workflows, retrieval systems, and tool-assisted analysis.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/70 bg-white/76 p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Chat</p>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  Persistent conversations tied to model and provider context.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/70 bg-white/76 p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Memory</p>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  Preferences, long-term memory, and recent context in one rail.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/70 bg-white/76 p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Agents</p>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  Launch tool-assisted tasks and inspect every persisted execution step.
                </p>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col justify-between p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                Authentication Required
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                Sign in before using {APP_NAME}
              </h2>
              <p className="mt-4 text-sm leading-6 text-black/60">
                Live conversation, memory, providers, and tools require an authenticated session.
              </p>
            </div>
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105"
              >
                Go to Login
              </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const sidebarProps = {
    userName: session.user.displayName,
    userEmail: session.user.email,
    currentWorkspace,
    pendingInvitationsCount: pendingInvitations.length,
    conversations,
    selectedConversationId,
    onSelectConversation: handleSelectConversation,
    onCreateConversation: handleStartNewChat,
    onOpenWorkspaceSettings: () => openWorkspacePanel("workspace"),
    onOpenProfileSettings: () => openWorkspacePanel("profile"),
    onDeleteConversation: handleDeleteConversation,
    deletingConversationId
  };

  return (
    <main className="relative h-[100svh] overflow-hidden p-3 md:p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-16 h-80 w-80 rounded-full bg-[#4fc2fb]/12 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-96 w-96 rounded-full bg-[#0d4673]/10 blur-3xl" />
      </div>
      <div className="relative flex h-full min-h-0 flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-[rgba(255,255,255,0.84)] px-4 py-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between xl:hidden">
          <div className="min-w-0">
            <AppIdentity size="sm" showSubtitle={false} showTagline={false} />
            <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">
              {currentWorkspace?.name ?? "Workspace"}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <button
              type="button"
              onClick={() => openWorkspacePanel("workspace")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white"
            >
              <Settings2 className="size-4" />
              Workspace
            </button>
            <button
              type="button"
              onClick={() => {
                setIsWorkspaceOpen(false);
                setIsNavigationOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white"
            >
              <Menu className="size-4" />
              Menu
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
          <div className="hidden min-h-0 xl:block">
            <Sidebar {...sidebarProps} className="h-full" />
          </div>
          <ChatShell
            currentWorkspace={currentWorkspace}
            userName={session.user.displayName}
            userEmail={session.user.email}
            conversationTitle={selectedConversation?.title ?? "New Chat"}
            conversationCount={conversations.length}
            pendingInvitationCount={pendingInvitations.length}
            activeView={activeView}
            messages={messages}
            pending={isStreaming || isLoadingMessages}
            error={error}
            agentObjective={agentObjective}
            agentError={agentError}
            providers={providers}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onProviderChange={setSelectedProvider}
            onModelChange={setSelectedModel}
            onSend={handleSendMessage}
            memoryItems={memoryItems}
            tools={tools}
            selectedToolNames={selectedToolNames}
            agentTasks={agentTasks}
            selectedTaskId={selectedTaskId}
            selectedTaskDetail={selectedTaskDetail}
            isAgentRunning={isRunningAgent}
            isLoadingTaskDetail={isLoadingTaskDetail}
            onViewChange={setActiveView}
            onOpenWorkspacePanel={openWorkspacePanel}
            onAgentObjectiveChange={setAgentObjective}
            onToggleTool={handleToggleTool}
            onRunAgent={handleRunAgent}
            onRefreshTasks={handleRefreshTasks}
            onSelectTask={handleSelectTask}
          />
        </div>
      </div>

      {isNavigationOpen ? (
        <div className="fixed inset-0 z-50 bg-[#08111d]/42 backdrop-blur-sm xl:hidden">
          <div
            className="absolute inset-0"
            onClick={() => setIsNavigationOpen(false)}
          />
          <div className="absolute inset-y-3 left-3 right-16 max-w-sm">
            <button
              type="button"
              onClick={() => setIsNavigationOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/15"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <Sidebar {...sidebarProps} className="h-full pr-3" />
          </div>
        </div>
      ) : null}

      <WorkspaceSettingsPanel
        isOpen={isWorkspaceOpen}
        section={workspacePanelSection}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        pendingInvitations={pendingInvitations}
        userName={session.user.displayName}
        userEmail={session.user.email}
        onClose={() => setIsWorkspaceOpen(false)}
        onCreateWorkspace={handleCreateWorkspace}
        onSwitchWorkspace={handleSwitchWorkspace}
        onInviteMember={handleInviteMember}
        onAcceptInvitation={handleAcceptInvitation}
        onLogout={handleLogout}
      />
    </main>
  );
}
