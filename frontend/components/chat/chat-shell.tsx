import { PanelRight, PanelRightClose } from "lucide-react";

import {
  AgentTaskDetail,
  AgentTaskSummary,
  ChatMessage,
  LlmProviderCatalog,
  MemoryItem,
  ToolDescriptor
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/branding";

import { ContextRail } from "./context-rail";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

interface ChatShellProps {
  conversationTitle: string;
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  agentObjective: string;
  agentError: string | null;
  providers: LlmProviderCatalog[];
  selectedProvider: string;
  selectedModel: string;
  memoryItems: MemoryItem[];
  tools: ToolDescriptor[];
  selectedToolNames: string[];
  agentTasks: AgentTaskSummary[];
  selectedTaskId: string | null;
  selectedTaskDetail: AgentTaskDetail | null;
  isAgentRunning: boolean;
  isLoadingTaskDetail: boolean;
  isWorkspaceOpen: boolean;
  onToggleWorkspace: () => void;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onAgentObjectiveChange: (objective: string) => void;
  onToggleTool: (toolName: string) => void;
  onRunAgent: () => void | Promise<void>;
  onRefreshTasks: () => void | Promise<void>;
  onSelectTask: (taskId: string) => void | Promise<void>;
  onSend: (message: string) => void | Promise<void>;
}

export function ChatShell({
  conversationTitle,
  messages,
  pending,
  error,
  agentObjective,
  agentError,
  providers,
  selectedProvider,
  selectedModel,
  memoryItems,
  tools,
  selectedToolNames,
  agentTasks,
  selectedTaskId,
  selectedTaskDetail,
  isAgentRunning,
  isLoadingTaskDetail,
  isWorkspaceOpen,
  onToggleWorkspace,
  onProviderChange,
  onModelChange,
  onAgentObjectiveChange,
  onToggleTool,
  onRunAgent,
  onRefreshTasks,
  onSelectTask,
  onSend
}: ChatShellProps) {
  const compactModel = selectedModel.replace(/:latest$/i, "");
  const modelLabel =
    selectedProvider && selectedModel
      ? `${selectedProvider} / ${compactModel}`
      : selectedProvider || selectedModel || "Model unassigned";

  return (
    <div
      className={cn(
        "relative grid h-full min-h-0 min-w-0 gap-3",
        isWorkspaceOpen ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1"
      )}
    >
      <section className="flex min-h-0 min-w-0 flex-col rounded-[34px] border border-white/70 bg-[rgba(255,255,255,0.84)] shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <header className="flex flex-col gap-4 border-b border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-4 sm:px-5 md:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
              {messages.length === 0 ? `${APP_NAME} Workspace` : "Live Conversation"}
            </p>
            <h1 className="mt-2 truncate text-[1.7rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2rem]">
              {conversationTitle}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Model-aware chat with tools, memory context, and agent execution controls.
            </p>
          </div>

          <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <div className="inline-flex justify-center rounded-full border border-black/5 bg-white/75 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] sm:justify-start">
              {pending ? "Responding" : "Ready"}
            </div>
            <div
              className="min-w-0 truncate rounded-full border border-black/5 bg-white/75 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] sm:max-w-[18rem] sm:text-left"
              title={modelLabel}
            >
              {modelLabel}
            </div>
            <button
              type="button"
              onClick={onToggleWorkspace}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white/65 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white"
            >
              {isWorkspaceOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRight className="size-4" />
              )}
              Workspace
            </button>
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:px-5 md:px-6">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-5 md:px-6">
          <MessageList messages={messages} />
        </div>

        <div className="border-t border-black/5 bg-white/80 px-4 py-4 backdrop-blur sm:px-5 md:px-6">
          <div className="mx-auto max-w-3xl">
            <MessageComposer
              providers={providers}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              disabled={pending}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
              onSend={onSend}
            />
          </div>
        </div>
      </section>

      {isWorkspaceOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-[#08111d]/36 backdrop-blur-sm xl:hidden"
            onClick={onToggleWorkspace}
          />
          <aside className="fixed inset-x-3 bottom-3 top-24 z-50 overflow-y-auto rounded-[34px] border border-white/70 bg-[rgba(247,250,252,0.96)] p-3 shadow-[0_26px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl xl:hidden">
            <ContextRail
              agentObjective={agentObjective}
              memoryItems={memoryItems}
              tools={tools}
              selectedToolNames={selectedToolNames}
              tasks={agentTasks}
              selectedTaskId={selectedTaskId}
              selectedTaskDetail={selectedTaskDetail}
              isRunningAgent={isAgentRunning}
              isLoadingTaskDetail={isLoadingTaskDetail}
              error={agentError}
              onAgentObjectiveChange={onAgentObjectiveChange}
              onToggleTool={onToggleTool}
              onRunAgent={onRunAgent}
              onRefreshTasks={onRefreshTasks}
              onSelectTask={onSelectTask}
            />
          </aside>
          <aside className="hidden min-h-0 overflow-y-auto rounded-[34px] border border-white/70 bg-[rgba(247,250,252,0.9)] p-3 shadow-[0_26px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:block">
            <ContextRail
              agentObjective={agentObjective}
              memoryItems={memoryItems}
              tools={tools}
              selectedToolNames={selectedToolNames}
              tasks={agentTasks}
              selectedTaskId={selectedTaskId}
              selectedTaskDetail={selectedTaskDetail}
              isRunningAgent={isAgentRunning}
              isLoadingTaskDetail={isLoadingTaskDetail}
              error={agentError}
              onAgentObjectiveChange={onAgentObjectiveChange}
              onToggleTool={onToggleTool}
              onRunAgent={onRunAgent}
              onRefreshTasks={onRefreshTasks}
              onSelectTask={onSelectTask}
            />
          </aside>
        </>
      ) : null}
    </div>
  );
}
