import {
  Bot,
  BrainCircuit,
  Database,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Wrench
} from "lucide-react";

import {
  AgentTaskDetail,
  AgentTaskStatus,
  AgentTaskStepStatus,
  MemoryItem,
  ToolDescriptor
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AgentConsoleProps {
  agentObjective: string;
  memoryItems: MemoryItem[];
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
  onSelectTask: (taskId: string) => void | Promise<void>;
}

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
      return "border-pine/20 bg-pine/10 text-pine";
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

function serializeValue(value: unknown, limit = 420): string {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);

  return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
}

export function AgentConsole({
  agentObjective,
  memoryItems,
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
  onSelectTask
}: AgentConsoleProps) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Memory</h3>
        </div>
        <div className="mt-4 space-y-3">
          {memoryItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
              Memory will populate after you start using the assistant.
            </div>
          ) : (
            memoryItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-black/5 bg-white/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-ink">{item.key}</p>
                  <Badge>{item.memoryType.replace("_", " ")}</Badge>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-black/70">{item.value}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Agent Console</h3>
        </div>
        <p className="mt-3 text-sm text-black/65">
          Launch a tool-assisted task against the current workspace and inspect each persisted execution step.
        </p>
        <textarea
          value={agentObjective}
          onChange={(event) => onAgentObjectiveChange(event.target.value)}
          placeholder="Summarize the RAG pipeline, inspect repository auth flow, or query the connected database."
          className="mt-4 min-h-28 w-full rounded-[24px] border border-black/10 bg-white/70 px-4 py-3 text-[15px] leading-6 text-ink outline-none transition focus:border-pine/40 focus:bg-white"
        />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
            Enabled tools
          </p>
          <Badge className="bg-white text-black/60">{selectedToolNames.length} selected</Badge>
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
                    ? "border-pine/20 bg-pine text-sand"
                    : "border-black/10 bg-white/70 text-black/65 hover:bg-white"
                )}
              >
                {tool.name}
              </button>
            );
          })}
        </div>
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              void onRunAgent();
            }}
            disabled={isRunningAgent}
            className="inline-flex w-full flex-1 items-center justify-center gap-2 rounded-full bg-pine px-4 py-3 text-sm font-semibold text-sand transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/50"
          >
            {isRunningAgent ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isRunningAgent ? "Running task" : "Run task"}
          </button>
          <button
            type="button"
            onClick={() => {
              void onRefreshTasks();
            }}
            disabled={isLoadingTaskDetail}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <RefreshCw className={cn("size-4", isLoadingTaskDetail && "animate-spin")} />
            Refresh
          </button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Recent Tasks</h3>
            <p className="mt-2 text-sm text-black/60">
              {tasks.length === 0
                ? "No agent task has been executed yet."
                : `${tasks.length} persisted runs available.`}
            </p>
          </div>
          {isLoadingTaskDetail ? <LoaderCircle className="size-4 animate-spin text-ember" /> : null}
        </div>
        <div className="mt-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
              Run an objective to populate task history.
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
                  "w-full rounded-2xl border p-4 text-left transition",
                  selectedTaskId === task.id
                    ? "border-pine/20 bg-pine/10"
                    : "border-black/5 bg-white/60 hover:bg-white/85"
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">{task.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-black/65">{task.objective}</p>
                  </div>
                  <Badge className={statusBadgeClass(task.status)}>{task.status}</Badge>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-black/45">
                  Updated {formatTimestamp(task.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Task Detail</h3>
        </div>
        {!selectedTaskDetail ? (
          <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
            Select a task to inspect steps, reasoning, and tool executions.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-ink">{selectedTaskDetail.task.title}</p>
                  <p className="mt-2 text-sm text-black/70">{selectedTaskDetail.task.objective}</p>
                </div>
                <Badge className={statusBadgeClass(selectedTaskDetail.task.status)}>
                  {selectedTaskDetail.task.status}
                </Badge>
              </div>
              {selectedTaskDetail.task.result ? (
                <div className="mt-4 rounded-2xl border border-pine/10 bg-pine/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine/70">
                    Final summary
                  </p>
                  <p className="mt-2 text-sm text-black/75">{selectedTaskDetail.task.result}</p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedTaskDetail.task.metadata.executedTools.map((toolName, index) => (
                  <Badge key={`${toolName}-${index}`} className="bg-white text-black/60">
                    {toolName}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">Steps</p>
              {selectedTaskDetail.task.metadata.steps.map((step) => (
                <div key={step.id} className="rounded-2xl border border-black/5 bg-white/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{step.title}</p>
                      <p className="mt-2 text-sm text-black/65">{step.rationale}</p>
                    </div>
                    <Badge className={statusBadgeClass(step.status)}>{step.status}</Badge>
                  </div>
                  {step.note ? <p className="mt-3 text-sm text-black/70">{step.note}</p> : null}
                  {step.toolName ? (
                    <div className="mt-3 rounded-2xl border border-black/5 bg-sand/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                        Tool
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">{step.toolName}</p>
                      {step.toolOutputPreview ? (
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-black/65">
                          {step.toolOutputPreview}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                  {step.error ? (
                    <p className="mt-3 text-sm font-medium text-red-700">{step.error}</p>
                  ) : null}
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-black/45">
                    {formatTimestamp(step.startedAt)} to {formatTimestamp(step.finishedAt)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                Reasoning log
              </p>
              {selectedTaskDetail.task.metadata.reasoningLog.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
                  No reasoning log recorded for this run.
                </div>
              ) : (
                selectedTaskDetail.task.metadata.reasoningLog.map((entry, index) => (
                  <div key={`${index}-${entry}`} className="rounded-2xl border border-black/5 bg-white/60 p-4 text-sm text-black/70">
                    {entry}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                Tool executions
              </p>
              {selectedTaskDetail.toolExecutions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
                  No persisted tool executions were attached to this task.
                </div>
              ) : (
                selectedTaskDetail.toolExecutions.map((execution) => (
                  <div key={execution.id} className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{execution.toolName}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-black/45">
                          {formatTimestamp(execution.createdAt)}
                        </p>
                      </div>
                      <Badge className={statusBadgeClass(execution.status)}>{execution.status}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-black/5 bg-sand/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                          Input
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-black/65">
                          {serializeValue(execution.inputPayload)}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-black/5 bg-sand/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                          Output
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-black/65">
                          {serializeValue(execution.outputPayload)}
                        </pre>
                      </div>
                    </div>
                    {execution.errorMessage ? (
                      <p className="mt-3 text-sm font-medium text-red-700">{execution.errorMessage}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="bg-pine text-sand">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-sand" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sand/70">RAG Stack</h3>
        </div>
        <p className="mt-4 text-sm text-sand/80">
          Uploads, chunking, embeddings, pgvector, and Qdrant are scaffolded. The agent console can now surface
          persisted tool runs against that stack from the live backend.
        </p>
      </Card>
    </div>
  );
}
