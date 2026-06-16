import {
  AgentTaskDetail,
  AgentTaskSummary,
  MemoryItem,
  ToolDescriptor
} from "@/lib/types";

import { AgentConsole } from "./agent-console";

interface ContextRailProps {
  agentObjective: string;
  memoryItems: MemoryItem[];
  tools: ToolDescriptor[];
  selectedToolNames: string[];
  tasks: AgentTaskSummary[];
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

export function ContextRail(props: ContextRailProps) {
  return (
    <AgentConsole {...props} />
  );
}
