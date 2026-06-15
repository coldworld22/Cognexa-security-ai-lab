import {
  AgentPlanStep,
  ChatMessage,
  ConversationSummary,
  DashboardMetric,
  MemoryItem
} from "./types";

export const conversations: ConversationSummary[] = [
  {
    id: "conv-1",
    title: "Threat model review",
    modelProvider: "qwen",
    modelName: "qwen2.5-coder",
    updatedAt: "2 min ago"
  },
  {
    id: "conv-2",
    title: "RAG ingestion pipeline",
    modelProvider: "llama",
    modelName: "llama3.3",
    updatedAt: "14 min ago"
  },
  {
    id: "conv-3",
    title: "SOC analyst copilot",
    modelProvider: "mistral",
    modelName: "codestral",
    updatedAt: "42 min ago"
  }
];

export const chatMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content:
      "## Workspace status\n\nThe platform scaffold is active with **auth**, **chat**, **memory**, **RAG**, **agents**, and **admin** domains.\n\nNext focus:\n- Wire real streaming completions\n- Replace placeholder document parsers\n- Enable live cost telemetry",
    createdAt: "16:40"
  },
  {
    id: "msg-2",
    role: "user",
    content:
      "Create an execution plan for uploading a policy PDF, chunking it, embedding it, and retrieving relevant context in chat.",
    createdAt: "16:41"
  },
  {
    id: "msg-3",
    role: "assistant",
    content:
      "1. Persist the uploaded file and its metadata.\n2. Parse text from the document parser adapter.\n3. Chunk the text with overlap.\n4. Generate embeddings and store them in `pgvector` or Qdrant.\n5. Retrieve top-k chunks during chat and merge them into the system context.",
    createdAt: "16:41"
  }
];

export const memoryItems: MemoryItem[] = [
  {
    id: "mem-1",
    memoryType: "preference",
    key: "response_style",
    value: "Concise, operator-focused output"
  },
  {
    id: "mem-2",
    memoryType: "long_term",
    key: "deployment_mode",
    value: "Self-hosted with local models only"
  },
  {
    id: "mem-3",
    memoryType: "short_term",
    key: "active_workstream",
    value: "Assistant platform bootstrap"
  }
];

export const agentPlan: AgentPlanStep[] = [
  {
    id: "step-1",
    title: "Inspect memory, files, and model availability",
    state: "done"
  },
  {
    id: "step-2",
    title: "Select retrieval and tool execution path",
    state: "running"
  },
  {
    id: "step-3",
    title: "Stream final answer back into chat",
    state: "ready"
  }
];

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "Conversations",
    value: "128",
    change: "+12% this week"
  },
  {
    label: "Indexed Files",
    value: "1,024",
    change: "+96 today"
  },
  {
    label: "Tool Executions",
    value: "3,408",
    change: "92% success"
  },
  {
    label: "Local Model Latency",
    value: "1.8s",
    change: "-240ms trend"
  }
];
