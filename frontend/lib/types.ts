export interface ConversationSummary {
  id: string;
  workspaceId?: string;
  title: string;
  modelProvider: string;
  modelName: string;
  updatedAt: string;
}

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  memoryType: "preference" | "long_term" | "short_term";
  key: string;
  value: string;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  state: "ready" | "running" | "done";
}

export interface DashboardMetric {
  label: string;
  value: string;
  change: string;
}

export interface AdminDashboard {
  metrics: {
    users: number;
    conversations: {
      total: number;
      last7Days: number;
    };
    messages: number;
    files: {
      total: number;
      indexed: number;
      uploaded: number;
      failed: number;
      indexedToday: number;
    };
    toolExecutions: {
      total: number;
      completed: number;
      failed: number;
      started: number;
      successRate: number;
    };
    tasks: number;
    localModel: {
      status: "up" | "degraded";
      endpoint: string;
      latencyMs: number | null;
      providerCount: number;
    };
  };
  modelUsage: Array<{
    provider: string;
    conversations: number;
  }>;
  health: {
    status: "ok" | "degraded";
    checkedAt: string;
    dependencies: {
      postgres: "up" | "degraded";
      redis: "up" | "degraded";
      llmProviders: LlmProviderCatalog[];
      localModel: {
        status: "up" | "degraded";
        endpoint: string;
        latencyMs?: number;
      };
    };
  };
  availableTools: ToolDescriptor[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: "super_admin" | "admin" | "manager" | "developer" | "viewer";
  preferences: Record<string, unknown>;
  currentWorkspaceId?: string;
  lastLoginAt?: string;
}

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceSummary {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isPersonal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  organizationName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  invitationToken?: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  category: "filesystem" | "repository" | "documentation" | "math" | "database" | "web";
  inputSchema: Record<string, unknown>;
}

export interface LlmProviderCatalog {
  id: string;
  models: string[];
}

export interface MemoryContext {
  preferences: MemoryItem[];
  longTerm: MemoryItem[];
  shortTerm: ChatMessage[];
}

export type AgentTaskStatus = "queued" | "running" | "completed" | "failed";

export type AgentTaskStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface AgentDefinition {
  id: string;
  workspaceId?: string;
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskPlanStep {
  id: string;
  title: string;
  rationale: string;
}

export interface AgentTaskTraceStep {
  id: string;
  title: string;
  rationale: string;
  status: AgentTaskStepStatus;
  startedAt?: string;
  finishedAt?: string;
  note?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolExecutionId?: string;
  toolOutputPreview?: string;
  error?: string;
}

export interface AgentTaskMetadata {
  steps: AgentTaskTraceStep[];
  executedTools: string[];
  reasoningLog: string[];
  finalSummary?: string;
  lastUpdatedAt?: string;
}

export interface AgentTaskSummary {
  id: string;
  agentId: string;
  conversationId?: string;
  title: string;
  objective: string;
  status: AgentTaskStatus;
  result?: string;
  metadata: AgentTaskMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolExecution {
  id: string;
  taskId?: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: "started" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskDetail {
  task: AgentTaskSummary;
  toolExecutions: AgentToolExecution[];
}

export interface AgentExecutionResult {
  summary: string;
  executedTools: string[];
  steps: AgentTaskTraceStep[];
  reasoningLog: string[];
}
