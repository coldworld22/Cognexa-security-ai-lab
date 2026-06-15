import { Pool } from "pg";
import { RedisClientType } from "redis";

import { Logger } from "pino";

import { AgentService } from "../services/agent/agent.service";
import { AdminService } from "../services/admin/admin.service";
import { AuthService } from "../services/auth/auth.service";
import { ChatService } from "../services/chat/chat.service";
import { HealthService } from "../services/health/health.service";
import { LLMService } from "../services/llm/llm.service";
import { MemoryService } from "../services/memory/memory.service";
import { RagService } from "../services/rag/rag.service";
import { ToolExecutionService } from "../services/tool-execution/tool-execution.service";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { BaseVectorStore } from "../rag/base-vector-store";

export interface AppContext {
  logger: Logger;
  postgres: Pool;
  redis: RedisClientType;
  toolRegistry: ToolRegistry;
  vectorStores: {
    primary: BaseVectorStore;
    qdrant: BaseVectorStore;
  };
  services: {
    auth: AuthService;
    chat: ChatService;
    memory: MemoryService;
    rag: RagService;
    agent: AgentService;
    llm: LLMService;
    admin: AdminService;
    tools: ToolExecutionService;
    health: HealthService;
  };
}
