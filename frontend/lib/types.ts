export interface ConversationSummary {
  id: string;
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

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  preferences: Record<string, unknown>;
  lastLoginAt?: string;
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
