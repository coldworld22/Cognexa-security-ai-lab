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

import { NetworkMonitorConsole } from "@/components/admin/network-monitor-console";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/lib/i18n";
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
  | "endpoints"
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

function formatTimestamp(
  value: string | undefined,
  fallback: string,
  formatDateTime: (value: string, options?: Intl.DateTimeFormatOptions) => string
) {
  if (!value) {
    return fallback;
  }

  return formatDateTime(value);
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

function statusLabel(
  status: AgentTaskStatus | AgentTaskStepStatus | "started",
  t: (key: string) => string
) {
  const statusKeyMap: Record<AgentTaskStatus | AgentTaskStepStatus | "started", string> = {
    queued: "common.status.queued",
    pending: "common.status.pending",
    running: "common.status.running",
    completed: "common.status.completed",
    failed: "common.status.failed",
    skipped: "common.status.skipped",
    started: "common.status.started"
  };

  return t(statusKeyMap[status] ?? "common.status.pending");
}

function WorkspaceTabs({
  activeView,
  onChange
}: {
  activeView: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  const { t } = useI18n();
  const workspaceTabs: Array<{ id: WorkspaceView; label: string }> = [
    { id: "chat", label: t("common.chat") },
    { id: "endpoints", label: t("common.endpoints") },
    { id: "documents", label: t("common.documents") },
    { id: "agents", label: t("common.agents") },
    { id: "memory", label: t("common.memory") },
    { id: "tasks", label: t("common.tasks") },
    { id: "security", label: t("common.security") }
  ];

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
  const { formatNumber, t } = useI18n();
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
            {t("documents.title")}
          </h3>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          {t("documents.headline")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
          {t("documents.description")}
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("documents.pipeline")}
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {t("documents.pipelineDescription")}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("documents.runtime")}
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {t("documents.runtimeDescription", {
                  provider: selectedProvider,
                  model: compactModel
                })}
              </span>
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("documents.toolSurfaces")}
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {t("documents.toolSurfacesDescription", {
                count: formatNumber(retrievalTools.length)
              })}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            {t("documents.inventory")}
          </h3>
        </div>

        <div className="mt-4 space-y-3">
          {retrievalTools.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              {t("documents.noTools")}
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
  const { formatNumber, t } = useI18n();

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.95fr)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[var(--brand-blue)]" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            {t("agents.console")}
          </h3>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          {t("agents.headline")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
          {t("agents.description")}
        </p>

        <textarea
          value={agentObjective}
          onChange={(event) => onAgentObjectiveChange(event.target.value)}
          placeholder={t("agents.placeholder")}
          className="mt-5 min-h-[150px] w-full rounded-[24px] border border-black/10 bg-white/88 px-4 py-4 text-[15px] leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
        />

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            {t("agents.enabledTools")}
          </p>
          <Badge>{t("common.selected", { count: formatNumber(selectedToolNames.length) })}</Badge>
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
            {isRunningAgent ? t("agents.runningTask") : t("agents.runTask")}
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
            {t("agents.refreshTasks")}
          </button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("agents.recentRuns")}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {tasks.length === 0
                  ? t("agents.noRuns")
                  : t("agents.persistedRuns", { count: formatNumber(tasks.length) })}
              </p>
            </div>
            {isLoadingTaskDetail ? (
              <LoaderCircle className="size-4 animate-spin text-[var(--brand-blue)]" />
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              {t("agents.populateHistory")}
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
                    <Badge className={statusBadgeClass(task.status)}>{statusLabel(task.status, t)}</Badge>
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
              {t("agents.activeTrace")}
            </h3>
          </div>
          {!selectedTaskDetail ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              {t("agents.selectTask")}
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedTaskDetail.task.title}
                </p>
                <Badge className={statusBadgeClass(selectedTaskDetail.task.status)}>
                  {statusLabel(selectedTaskDetail.task.status, t)}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {selectedTaskDetail.task.result ??
                  t("agents.openTrace")}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MemoryView({ memoryItems }: { memoryItems: MemoryItem[] }) {
  const { t } = useI18n();
  const sections: Array<{
    id: MemoryItem["memoryType"];
    title: string;
    description: string;
  }> = [
    {
      id: "preference",
      title: t("memory.preferences"),
      description: t("memory.preferencesDescription")
    },
    {
      id: "long_term",
      title: t("memory.longTerm"),
      description: t("memory.longTermDescription")
    },
    {
      id: "short_term",
      title: t("memory.shortTerm"),
      description: t("memory.shortTermDescription")
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
                  {t("memory.noEntries", { section: section.title })}
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
                      <Badge>{t(`enums.memoryTypes.${item.memoryType}`)}</Badge>
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
  const { formatDateTime, formatNumber, t } = useI18n();

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("tasks.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {tasks.length === 0
                ? t("tasks.noTasks")
                : t("agents.persistedRuns", { count: formatNumber(tasks.length) })}
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
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              {t("agents.populateHistory")}
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
                  <Badge className={statusBadgeClass(task.status)}>{statusLabel(task.status, t)}</Badge>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                  {formatTimestamp(task.updatedAt, t("common.pending"), formatDateTime)}
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
            {t("tasks.detailTitle")}
          </h3>
        </div>

        {!selectedTaskDetail ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
            {t("tasks.selectTask")}
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
                  {statusLabel(selectedTaskDetail.task.status, t)}
                </Badge>
              </div>

              {selectedTaskDetail.task.result ? (
                <div className="mt-4 rounded-[20px] border border-[#1a78cf]/12 bg-white/75 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    {t("tasks.overview")}
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
                {t("tasks.steps")}
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
                    <Badge className={statusBadgeClass(step.status)}>{statusLabel(step.status, t)}</Badge>
                  </div>

                  {step.note ? (
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.note}
                    </p>
                  ) : null}

                  {step.toolName ? (
                    <div className="mt-3 rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("tasks.tool")}
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
                    {t("tasks.fromTo", {
                      from: formatTimestamp(step.startedAt, t("common.pending"), formatDateTime),
                      to: formatTimestamp(step.finishedAt, t("common.pending"), formatDateTime)
                    })}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("tasks.reasoningLog")}
              </p>
              {selectedTaskDetail.task.metadata.reasoningLog.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  {t("tasks.noReasoning")}
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
                {t("tasks.toolExecutions")}
              </p>
              {selectedTaskDetail.toolExecutions.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  {t("tasks.noToolExecutions")}
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
                          {formatTimestamp(execution.createdAt, t("common.pending"), formatDateTime)}
                        </p>
                      </div>
                      <Badge className={statusBadgeClass(execution.status)}>
                        {statusLabel(execution.status, t)}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          {t("tasks.input")}
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                          {serializeValue(execution.inputPayload)}
                        </pre>
                      </div>
                      <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          {t("tasks.output")}
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
  const { formatNumber, t } = useI18n();
  const compactModel = selectedModel.replace(/:latest$/i, "");

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("security.governance")}
            </h3>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {t("security.headline")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            {t("security.description")}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("security.role")}
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {t(`enums.workspaceRoles.${currentWorkspace?.role ?? "viewer"}`)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("security.invitations")}
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {t("security.invitationsPending", {
                  count: formatNumber(pendingInvitationCount)
                })}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("security.status")}
              </p>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {pending ? t("common.status.responding") : t("common.status.ready")}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <FolderKanban className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("security.currentWorkspace")}
            </h3>
          </div>
          <div className="mt-4 rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-base font-semibold text-[var(--text-primary)]">
              {currentWorkspace?.name ?? t("sidebar.noWorkspaceSelected")}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {currentWorkspace?.organizationName ?? t("sidebar.noOrganizationContext")}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {t("security.activeConversation", {
                title: conversationTitle || t("workspace.conversationTitleFallback"),
                count: formatNumber(conversationCount)
              })}
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("security.runtimeAccess")}
            </h3>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("security.currentModel")}
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
              {t("security.openWorkspaceSettings")}
            </button>
            <button
              type="button"
              onClick={() => onOpenWorkspacePanel("profile")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Sparkles className="size-4" />
              {t("security.openProfilePanel")}
            </button>
            <Link
              href="/admin"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105"
            >
              <Shield className="size-4" />
              {t("security.openAdminConsole")}
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("security.accountContext")}
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
  const { t } = useI18n();
  const compactModel = selectedModel.replace(/:latest$/i, "");
  const modelLabel =
    selectedProvider && selectedModel
      ? `${selectedProvider} / ${compactModel}`
      : selectedProvider || selectedModel || t("chat.modelUnassigned");
  const workspaceName = currentWorkspace?.name ?? t("common.workspace");
  const workspaceStatus = pending ? t("common.status.responding") : t("common.status.ready");

  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] rounded-[30px] border border-white/70 bg-[rgba(255,255,255,0.84)] shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <header className="border-b border-black/5 px-4 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              {t("workspace.workspaceLabel")}
            </p>
            <h1 className="mt-2 truncate text-[1.8rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2rem]">
              {workspaceName}
            </h1>
            <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">
              {currentWorkspace?.organizationName ?? t("chat.personalWorkspace")}
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
            <LanguageSwitcher className="border-black/10 bg-white text-[var(--text-primary)] shadow-none [&_span]:text-[var(--text-secondary)]" compact />
            <button
              type="button"
              onClick={() => onOpenWorkspacePanel("workspace")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Settings2 className="size-4" />
              {t("common.workspace")}
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
          {activeView === "endpoints" ? <NetworkMonitorConsole /> : null}

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
