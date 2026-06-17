import Link from "next/link";
import {
  Bot,
  BookText,
  BrainCircuit,
  Database,
  FolderKanban,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
  Settings2,
  Shield,
  Sparkles,
  Wrench
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AgentTaskDetail,
  AgentTaskStatus,
  AgentTaskStepStatus,
  ChatMessage,
  LlmProviderCatalog,
  MemoryItem,
  ToolDescriptor,
  WorkspaceSummary
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

export type WorkspaceView =
  | "chat"
  | "documents"
  | "agents"
  | "memory"
  | "tasks"
  | "security";

type WorkspacePanelSection = "workspace" | "profile";

interface ChatShellProps {
  currentWorkspace: WorkspaceSummary | null;
  userName: string;
  userEmail: string;
  conversationTitle: string;
  conversationCount: number;
  pendingInvitationCount: number;
  activeView: WorkspaceView;
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
  agentTasks: AgentTaskDetail["task"][];
  selectedTaskId: string | null;
  selectedTaskDetail: AgentTaskDetail | null;
  isAgentRunning: boolean;
  isLoadingTaskDetail: boolean;
  onViewChange: (view: WorkspaceView) => void;
  onOpenWorkspacePanel: (section?: WorkspacePanelSection) => void;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onAgentObjectiveChange: (objective: string) => void;
  onToggleTool: (toolName: string) => void;
  onRunAgent: () => void | Promise<void>;
  onRefreshTasks: () => void | Promise<void>;
  onSelectTask: (taskId: string) => void | Promise<void>;
  onSend: (message: string) => void | Promise<void>;
}

const workspaceTabs: Array<{ id: WorkspaceView; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "documents", label: "Documents" },
  { id: "agents", label: "Agents" },
  { id: "memory", label: "Memory" },
  { id: "tasks", label: "Tasks" },
  { id: "security", label: "Security" }
];

function formatTimestamp(value?: string) {
  if (!value) {
    return "Pending";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusBadgeClass(
  status: AgentTaskStatus | AgentTaskStepStatus | "started"
): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
    case "started":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "skipped":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-black/10 bg-white text-black/60";
  }
}

function serializeValue(value: unknown, limit = 520): string {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);

  return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
}

function WorkspaceTabs({
  activeView,
  onChange
}: {
  activeView: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <nav className="border-b border-black/5 px-3 py-3 sm:px-5 lg:px-6">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto pb-1">
        {workspaceTabs.map((tab) => {
          const active = tab.id === activeView;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition",
                active
                  ? "border-[#1a78cf]/30 bg-[linear-gradient(135deg,rgba(21,167,243,0.18)_0%,rgba(13,123,213,0.08)_100%)] text-[var(--text-primary)] shadow-[0_8px_24px_rgba(21,167,243,0.12)]"
                  : "border-transparent bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-black/6 hover:bg-white"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DocumentsView({
  selectedProvider,
  selectedModel,
  tools
}: {
  selectedProvider: string;
  selectedModel: string;
  tools: ToolDescriptor[];
}) {
  const retrievalTools = tools.filter((tool) =>
    ["documentation", "repository", "filesystem", "database"].includes(tool.category)
  );
  const compactModel = selectedModel.replace(/:latest$/i, "");

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <BookText className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Document Workspace
          </h3>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          Retrieval and document analysis stay attached to the active workspace.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
          Cognexa already scaffolds ingestion, embeddings, and persisted retrieval. Use chat for
          ad-hoc analysis, or use agent tasks when you need repeatable multi-step investigation.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Pipeline
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Uploads, parsing, chunking, embeddings, and vector storage are all represented in the
              current stack.
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Runtime
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Active model:{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {selectedProvider} / {compactModel}
              </span>
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Tool Surfaces
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {retrievalTools.length} document-oriented tools are available in this workspace.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Tool Inventory
          </h3>
        </div>

        <div className="mt-4 space-y-3">
          {retrievalTools.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              No retrieval-oriented tools are currently exposed to the frontend.
            </div>
          ) : (
            retrievalTools.map((tool) => (
              <div
                key={tool.name}
                className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{tool.name}</p>
                  <Badge>{tool.category}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {tool.description}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function AgentsView({
  agentObjective,
  tools,
  selectedToolNames,
  tasks,
  selectedTaskId,
  selectedTaskDetail,
  isRunningAgent,
  isLoadingTaskDetail,
  error,
  onAgentObjectiveChange,
  onToggleTool,
  onRunAgent,
  onRefreshTasks,
  onOpenTask
}: {
  agentObjective: string;
  tools: ToolDescriptor[];
  selectedToolNames: string[];
  tasks: AgentTaskDetail["task"][];
  selectedTaskId: string | null;
  selectedTaskDetail: AgentTaskDetail | null;
  isRunningAgent: boolean;
  isLoadingTaskDetail: boolean;
  error: string | null;
  onAgentObjectiveChange: (objective: string) => void;
  onToggleTool: (toolName: string) => void;
  onRunAgent: () => void | Promise<void>;
  onRefreshTasks: () => void | Promise<void>;
  onOpenTask: (taskId: string) => void | Promise<void>;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.95fr)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Agent Console
          </h3>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          Launch tool-assisted tasks against the current workspace.
        </h2>
        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
          This is the execution surface for repeatable investigations, engineering checks, and
          workspace-wide analysis.
        </p>

        <textarea
          value={agentObjective}
          onChange={(event) => onAgentObjectiveChange(event.target.value)}
          placeholder="Summarize the RAG pipeline, inspect repository auth flow, or review task traces."
          className="mt-5 min-h-[150px] w-full rounded-[24px] border border-black/10 bg-white/88 px-4 py-4 text-[15px] leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
        />

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            Enabled tools
          </p>
          <Badge>{selectedToolNames.length} selected</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {tools.map((tool) => {
            const active = selectedToolNames.includes(tool.name);

            return (
              <button
                key={tool.name}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleTool(tool.name)}
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  active
                    ? "border-[#1a78cf]/30 bg-[var(--brand-deep)] text-white"
                    : "border-black/10 bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
                )}
              >
                {tool.name}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              void onRunAgent();
            }}
            disabled={isRunningAgent}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isRunningAgent ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isRunningAgent ? "Running Task" : "Run Task"}
          </button>
          <button
            type="button"
            onClick={() => {
              void onRefreshTasks();
            }}
            disabled={isLoadingTaskDetail}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", isLoadingTaskDetail && "animate-spin")} />
            Refresh Tasks
          </button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Recent Runs
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {tasks.length === 0
                  ? "No persisted agent runs yet."
                  : `${tasks.length} persisted runs available.`}
              </p>
            </div>
            {isLoadingTaskDetail ? (
              <LoaderCircle className="size-4 animate-spin text-[var(--brand-blue)]" />
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {tasks.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                Run an objective to populate workspace task history.
              </div>
            ) : (
              tasks.slice(0, 4).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    void onOpenTask(task.id);
                  }}
                  className={cn(
                    "w-full rounded-[20px] border p-4 text-left transition",
                    selectedTaskId === task.id
                      ? "border-[#1a78cf]/25 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)]"
                      : "border-black/6 bg-[var(--surface-soft)] hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {task.title}
                    </p>
                    <Badge className={statusBadgeClass(task.status)}>{task.status}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {task.objective}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <SendHorizontal className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Active Trace
            </h3>
          </div>
          {!selectedTaskDetail ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              Select a task to inspect detail in the Tasks tab.
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedTaskDetail.task.title}
                </p>
                <Badge className={statusBadgeClass(selectedTaskDetail.task.status)}>
                  {selectedTaskDetail.task.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {selectedTaskDetail.task.result ??
                  "Open the full task trace to inspect steps, reasoning, and tool executions."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MemoryView({ memoryItems }: { memoryItems: MemoryItem[] }) {
  const sections: Array<{
    id: MemoryItem["memoryType"];
    title: string;
    description: string;
  }> = [
    {
      id: "preference",
      title: "Preferences",
      description: "Stable operator preferences and workspace-specific behavior."
    },
    {
      id: "long_term",
      title: "Long-Term Memory",
      description: "Persisted knowledge carried across conversations."
    },
    {
      id: "short_term",
      title: "Short-Term Context",
      description: "Recent conversation context feeding the current workspace."
    }
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-3">
      {sections.map((section) => {
        const items = memoryItems.filter((item) => item.memoryType === section.id);

        return (
          <Card key={section.id} className="p-6">
            <div className="flex items-center gap-2">
              <BrainCircuit className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {section.title}
              </h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {section.description}
            </p>
            <div className="mt-5 space-y-3">
              {items.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  No {section.title.toLowerCase()} entries yet.
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {item.key}
                      </p>
                      <Badge>{item.memoryType.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.value}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TasksView({
  tasks,
  selectedTaskId,
  selectedTaskDetail,
  isLoadingTaskDetail,
  onRefreshTasks,
  onSelectTask
}: {
  tasks: AgentTaskDetail["task"][];
  selectedTaskId: string | null;
  selectedTaskDetail: AgentTaskDetail | null;
  isLoadingTaskDetail: boolean;
  onRefreshTasks: () => void | Promise<void>;
  onSelectTask: (taskId: string) => void | Promise<void>;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Task History
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {tasks.length === 0
                ? "No agent task has been executed yet."
                : `${tasks.length} persisted runs available.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void onRefreshTasks();
            }}
            disabled={isLoadingTaskDetail}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", isLoadingTaskDetail && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              Run an objective in the Agents tab to populate task history.
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  void onSelectTask(task.id);
                }}
                className={cn(
                  "w-full rounded-[20px] border p-4 text-left transition",
                  selectedTaskId === task.id
                    ? "border-[#1a78cf]/25 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)]"
                    : "border-black/6 bg-[var(--surface-soft)] hover:bg-white"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {task.title}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
                      {task.objective}
                    </p>
                  </div>
                  <Badge className={statusBadgeClass(task.status)}>{task.status}</Badge>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                  Updated {formatTimestamp(task.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Task Detail
          </h3>
        </div>

        {!selectedTaskDetail ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
            Select a task to inspect steps, reasoning, and tool executions.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {selectedTaskDetail.task.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {selectedTaskDetail.task.objective}
                  </p>
                </div>
                <Badge className={statusBadgeClass(selectedTaskDetail.task.status)}>
                  {selectedTaskDetail.task.status}
                </Badge>
              </div>

              {selectedTaskDetail.task.result ? (
                <div className="mt-4 rounded-[20px] border border-[#1a78cf]/12 bg-white/75 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Final Summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {selectedTaskDetail.task.result}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedTaskDetail.task.metadata.executedTools.map((toolName, index) => (
                  <Badge key={`${toolName}-${index}`}>{toolName}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Steps
              </p>
              {selectedTaskDetail.task.metadata.steps.map((step) => (
                <div
                  key={step.id}
                  className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {step.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {step.rationale}
                      </p>
                    </div>
                    <Badge className={statusBadgeClass(step.status)}>{step.status}</Badge>
                  </div>

                  {step.note ? (
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.note}
                    </p>
                  ) : null}

                  {step.toolName ? (
                    <div className="mt-3 rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        Tool
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                        {step.toolName}
                      </p>
                      {step.toolOutputPreview ? (
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                          {step.toolOutputPreview}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}

                  {step.error ? (
                    <p className="mt-3 text-sm font-medium text-red-700">{step.error}</p>
                  ) : null}

                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    {formatTimestamp(step.startedAt)} to {formatTimestamp(step.finishedAt)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Reasoning Log
              </p>
              {selectedTaskDetail.task.metadata.reasoningLog.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  No reasoning log recorded for this run.
                </div>
              ) : (
                selectedTaskDetail.task.metadata.reasoningLog.map((entry, index) => (
                  <div
                    key={`${index}-${entry}`}
                    className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]"
                  >
                    {entry}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Tool Executions
              </p>
              {selectedTaskDetail.toolExecutions.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  No persisted tool executions were attached to this task.
                </div>
              ) : (
                selectedTaskDetail.toolExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {execution.toolName}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                          {formatTimestamp(execution.createdAt)}
                        </p>
                      </div>
                      <Badge className={statusBadgeClass(execution.status)}>
                        {execution.status}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          Input
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                          {serializeValue(execution.inputPayload)}
                        </pre>
                      </div>
                      <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          Output
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                          {serializeValue(execution.outputPayload)}
                        </pre>
                      </div>
                    </div>

                    {execution.errorMessage ? (
                      <p className="mt-3 text-sm font-medium text-red-700">
                        {execution.errorMessage}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SecurityView({
  currentWorkspace,
  userName,
  userEmail,
  pending,
  pendingInvitationCount,
  selectedProvider,
  selectedModel,
  conversationCount,
  conversationTitle,
  onOpenWorkspacePanel
}: {
  currentWorkspace: WorkspaceSummary | null;
  userName: string;
  userEmail: string;
  pending: boolean;
  pendingInvitationCount: number;
  selectedProvider: string;
  selectedModel: string;
  conversationCount: number;
  conversationTitle: string;
  onOpenWorkspacePanel: (section?: WorkspacePanelSection) => void;
}) {
  const compactModel = selectedModel.replace(/:latest$/i, "");

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Workspace Governance
            </h3>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Keep access, runtime, and task operations scoped to the active workspace.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            Workspace management now lives in a dedicated settings panel so chat and task surfaces
            stay uncluttered.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Role
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {currentWorkspace?.role ?? "viewer"}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Invitations
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {pendingInvitationCount} pending
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Status
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {pending ? "Responding" : "Ready"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <FolderKanban className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Current Workspace
            </h3>
          </div>
          <div className="mt-4 rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-base font-semibold text-[var(--text-primary)]">
              {currentWorkspace?.name ?? "No workspace selected"}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {currentWorkspace?.organizationName ?? "No organization context"}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Active conversation: {conversationTitle || "New Chat"} / {conversationCount} total
              threads
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Runtime and Access
            </h3>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Current Model
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {selectedProvider} / {compactModel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenWorkspacePanel("workspace")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Settings2 className="size-4" />
              Open Workspace Settings
            </button>
            <button
              type="button"
              onClick={() => onOpenWorkspacePanel("profile")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Sparkles className="size-4" />
              Open Profile Panel
            </button>
            <Link
              href="/admin"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105"
            >
              <Shield className="size-4" />
              Open Admin Console
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Account Context
            </h3>
          </div>
          <div className="mt-4 rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-base font-semibold text-[var(--text-primary)]">{userName}</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{userEmail}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function ChatShell({
  currentWorkspace,
  userName,
  userEmail,
  conversationTitle,
  conversationCount,
  pendingInvitationCount,
  activeView,
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
  onViewChange,
  onOpenWorkspacePanel,
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
  const workspaceName = currentWorkspace?.name ?? "Workspace";
  const workspaceStatus = pending ? "Responding" : "Ready";

  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] rounded-[30px] border border-white/70 bg-[rgba(255,255,255,0.84)] shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <header className="border-b border-black/5 px-4 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              Workspace
            </p>
            <h1 className="mt-2 truncate text-[1.8rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2rem]">
              {workspaceName}
            </h1>
            <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">
              {currentWorkspace?.organizationName ?? "Personal workspace"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-black/6 bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {workspaceStatus}
            </div>
            <div
              className="min-w-0 max-w-[18rem] truncate rounded-full border border-black/6 bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]"
              title={modelLabel}
            >
              {modelLabel}
            </div>
            <button
              type="button"
              onClick={() => onOpenWorkspacePanel("workspace")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Settings2 className="size-4" />
              Workspace
            </button>
          </div>
        </div>
      </header>

      <WorkspaceTabs activeView={activeView} onChange={onViewChange} />

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:px-5 lg:px-6">
          {error}
        </div>
      ) : null}

      {activeView === "chat" ? (
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 overflow-y-auto px-3 py-4 sm:px-5 lg:px-6">
            <MessageList messages={messages} />
          </div>
          <div className="sticky bottom-0 z-10 border-t border-black/5 bg-[rgba(255,255,255,0.92)] px-3 py-3 backdrop-blur sm:px-5 lg:px-6">
            <div className="mx-auto max-w-6xl">
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
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto px-3 py-4 sm:px-5 lg:px-6">
          {activeView === "documents" ? (
            <DocumentsView
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              tools={tools}
            />
          ) : null}

          {activeView === "agents" ? (
            <AgentsView
              agentObjective={agentObjective}
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
              onOpenTask={async (taskId) => {
                onViewChange("tasks");
                await onSelectTask(taskId);
              }}
            />
          ) : null}

          {activeView === "memory" ? <MemoryView memoryItems={memoryItems} /> : null}

          {activeView === "tasks" ? (
            <TasksView
              tasks={agentTasks}
              selectedTaskId={selectedTaskId}
              selectedTaskDetail={selectedTaskDetail}
              isLoadingTaskDetail={isLoadingTaskDetail}
              onRefreshTasks={onRefreshTasks}
              onSelectTask={onSelectTask}
            />
          ) : null}

          {activeView === "security" ? (
            <SecurityView
              currentWorkspace={currentWorkspace}
              userName={userName}
              userEmail={userEmail}
              pending={pending}
              pendingInvitationCount={pendingInvitationCount}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              conversationCount={conversationCount}
              conversationTitle={conversationTitle}
              onOpenWorkspacePanel={onOpenWorkspacePanel}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
