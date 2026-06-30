import { Pool } from "pg";
import { RedisClientType } from "redis";

import { Logger } from "pino";

import { AgentService } from "../services/agent/agent.service";
import { AdminService } from "../services/admin/admin.service";
import { AuthorizedSecurityTestingService } from "../services/authorized-testing/authorized-security-testing.service";
import { AuthorizationService } from "../services/authorization/authorization.service";
import { AuthService } from "../services/auth/auth.service";
import { ChatService } from "../services/chat/chat.service";
import { HealthService } from "../services/health/health.service";
import { LLMService } from "../services/llm/llm.service";
import { MemoryService } from "../services/memory/memory.service";
import { EndpointMonitorService } from "../services/endpoints/endpoint-monitor.service";
import { PolicyService } from "../services/policy/policy.service";
import { PenetrationTestOrchestratorFactory } from "../services/penetration-testing/penetration-test-orchestrator.service";
import { CloakingService } from "../services/private-mode/cloaking.service";
import { RagService } from "../services/rag/rag.service";
import { ToolExecutionService } from "../services/tool-execution/tool-execution.service";
import { WorkspaceService } from "../services/workspace/workspace.service";
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
    authorizedTesting: AuthorizedSecurityTestingService;
    authorization: AuthorizationService;
    chat: ChatService;
    memory: MemoryService;
    rag: RagService;
    agent: AgentService;
    endpoints: EndpointMonitorService;
    llm: LLMService;
    admin: AdminService;
    policy: PolicyService;
    privateMode: CloakingService;
    penetrationTesting: PenetrationTestOrchestratorFactory;
    tools: ToolExecutionService;
    health: HealthService;
    workspace: WorkspaceService;
  };
}
