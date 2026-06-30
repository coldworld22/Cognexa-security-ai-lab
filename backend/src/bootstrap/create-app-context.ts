import { createLogger } from "../config/logger";
import { createPostgresPool } from "../database/postgres";
import { createRedisClient } from "../database/redis";
import { UserRepository } from "../database/repositories/user.repository";
import { ConversationRepository } from "../database/repositories/conversation.repository";
import { MessageRepository } from "../database/repositories/message.repository";
import { MemoryRepository } from "../database/repositories/memory.repository";
import { FileRepository } from "../database/repositories/file.repository";
import { EmbeddingRepository } from "../database/repositories/embedding.repository";
import { AuthorizationAuditLogRepository } from "../database/repositories/authorization-audit-log.repository";
import { AgentRepository } from "../database/repositories/agent.repository";
import { TaskRepository } from "../database/repositories/task.repository";
import { ToolExecutionRepository } from "../database/repositories/tool-execution.repository";
import { OrganizationRepository } from "../database/repositories/organization.repository";
import { PolicyAuditLogRepository } from "../database/repositories/policy-audit-log.repository";
import { PolicyRepository } from "../database/repositories/policy.repository";
import { MonitoredEndpointRepository } from "../database/repositories/monitored-endpoint.repository";
import { ManagedEndpointRepository } from "../database/repositories/managed-endpoint.repository";
import { NetworkDiscoveryHostRepository } from "../database/repositories/network-discovery-host.repository";
import { WorkspaceRepository } from "../database/repositories/workspace.repository";
import { WorkspaceMemberRepository } from "../database/repositories/workspace-member.repository";
import { WorkspaceInvitationRepository } from "../database/repositories/workspace-invitation.repository";
import { AuthorizedDomainVerificationRepository } from "../database/repositories/authorized-domain-verification.repository";
import { AuthorizedSecurityTestRunRepository } from "../database/repositories/authorized-security-test-run.repository";
import { AuthorizedSecurityTestEventRepository } from "../database/repositories/authorized-security-test-event.repository";
import { PrivateModeConfigRepository } from "../database/repositories/private-mode-config.repository";
import { PrivateModeSessionRepository } from "../database/repositories/private-mode-session.repository";
import { PrivateModeExitLogRepository } from "../database/repositories/private-mode-exit-log.repository";
import { PgVectorStore } from "../rag/vector-stores/pgvector.store";
import { QdrantVectorStore } from "../rag/vector-stores/qdrant.store";
import { ProviderFactory } from "../llm/provider-factory";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { registerDefaultTools } from "../tools/register-default-tools";
import { ToolExecutionService } from "../services/tool-execution/tool-execution.service";
import { LLMService } from "../services/llm/llm.service";
import { AuthService } from "../services/auth/auth.service";
import { AuthorizationService } from "../services/authorization/authorization.service";
import { MemoryService } from "../services/memory/memory.service";
import { ChatService } from "../services/chat/chat.service";
import { RagService } from "../services/rag/rag.service";
import { AgentService } from "../services/agent/agent.service";
import { AdminService } from "../services/admin/admin.service";
import { HealthService } from "../services/health/health.service";
import { DocumentParserService } from "../rag/ingestion/document-parser.service";
import { EmbeddingService } from "../rag/embedding/embedding.service";
import { OpenAICompatibleEmbeddingProvider } from "../rag/embedding/openai-compatible-embedding-provider";
import { TextChunker } from "../rag/chunking/text-chunker";
import { RetrievalEngine } from "../rag/retrieval/retrieval-engine";
import { TaskPlanner } from "../agent/planner/task-planner";
import { AgentExecutor } from "../agent/execution/agent-executor";
import { env } from "../config/env";
import { AppContext } from "./app-context";
import { initializeRuntime } from "./initialize-runtime";
import { RetrievalContextService } from "../services/rag/retrieval-context.service";
import { WorkspaceService } from "../services/workspace/workspace.service";
import { PolicyService } from "../services/policy/policy.service";
import { EndpointMonitorService } from "../services/endpoints/endpoint-monitor.service";
import { PenetrationTestOrchestratorFactory } from "../services/penetration-testing/penetration-test-orchestrator.service";
import { FortiGateClientService } from "../services/integrations/fortigate-client.service";
import { WebsiteScannerService } from "../services/website-scanner/website-scanner.service";
import { SecurityReviewService } from "../services/security-review/security-review.service";
import { AuthorizedSecurityTestingService } from "../services/authorized-testing/authorized-security-testing.service";
import { CloakingService } from "../services/private-mode/cloaking.service";
import { VerificationBypassService } from "../services/authorized-testing/verification-bypass.service";
import {
  HeadlessBrowserCrawler,
  resolveBrowserExecutablePath
} from "../services/website-scanner/headless-browser-crawler";
import { getDevModeConfig } from "../config/dev-mode.config";

export async function createAppContext(): Promise<AppContext> {
  const logger = createLogger();
  const postgres = createPostgresPool(env.POSTGRES_URL);
  postgres.on("error", (error) => {
    logger.error({ error }, "PostgreSQL pool error");
  });

  const redis = createRedisClient(env.REDIS_URL);
  redis.on("error", (error) => {
    logger.error({ error }, "Redis client error");
  });

  await initializeRuntime(postgres, redis, logger);

  const repositories = {
    users: new UserRepository(postgres),
    conversations: new ConversationRepository(postgres),
    messages: new MessageRepository(postgres),
    memories: new MemoryRepository(postgres),
    files: new FileRepository(postgres),
    embeddings: new EmbeddingRepository(postgres),
    authorizationAuditLogs: new AuthorizationAuditLogRepository(postgres),
    agents: new AgentRepository(postgres),
    tasks: new TaskRepository(postgres),
    toolExecutions: new ToolExecutionRepository(postgres),
    policies: new PolicyRepository(postgres),
    policyAuditLogs: new PolicyAuditLogRepository(postgres),
    monitoredEndpoints: new MonitoredEndpointRepository(postgres),
    managedEndpoints: new ManagedEndpointRepository(postgres),
    networkDiscoveryHosts: new NetworkDiscoveryHostRepository(postgres),
    organizations: new OrganizationRepository(postgres),
    workspaces: new WorkspaceRepository(postgres),
    workspaceMembers: new WorkspaceMemberRepository(postgres),
    workspaceInvitations: new WorkspaceInvitationRepository(postgres),
    authorizedDomainVerifications: new AuthorizedDomainVerificationRepository(postgres),
    authorizedSecurityTestRuns: new AuthorizedSecurityTestRunRepository(postgres),
    authorizedSecurityTestEvents: new AuthorizedSecurityTestEventRepository(postgres),
    privateModeConfigs: new PrivateModeConfigRepository(postgres),
    privateModeSessions: new PrivateModeSessionRepository(postgres),
    privateModeExitLogs: new PrivateModeExitLogRepository(postgres)
  };

  const toolRegistry = new ToolRegistry(logger);
  registerDefaultTools(toolRegistry, postgres);

  const vectorStores = {
    primary: new PgVectorStore(postgres, env.EMBEDDING_DIMENSION),
    qdrant: new QdrantVectorStore(env.QDRANT_URL, env.EMBEDDING_DIMENSION)
  };

  const providerFactory = new ProviderFactory({
    baseUrl: env.LOCAL_MODEL_BASE_URL,
    defaultModel: env.DEFAULT_LLM_MODEL
  });

  const policy = new PolicyService(
    repositories.policies,
    repositories.policyAuditLogs
  );
  const workspace = new WorkspaceService(
    repositories.users,
    repositories.organizations,
    repositories.workspaces,
    repositories.workspaceMembers,
    repositories.workspaceInvitations,
    policy
  );
  const authorization = new AuthorizationService(
    repositories.users,
    repositories.authorizationAuditLogs,
    redis,
    logger,
    workspace,
    {
      cacheTtlSeconds: env.AUTHZ_CACHE_TTL_SECONDS
    }
  );
  const tools = new ToolExecutionService(
    toolRegistry,
    repositories.toolExecutions,
    authorization,
    policy
  );
  const llm = new LLMService(providerFactory, tools, policy);
  const memory = new MemoryService(
    repositories.memories,
    repositories.messages,
    authorization
  );
  const embeddingService = new EmbeddingService(
    new OpenAICompatibleEmbeddingProvider({
      baseUrl: env.LOCAL_EMBEDDING_BASE_URL,
      providerId: "openai-compatible",
      defaultModel: env.DEFAULT_EMBEDDING_MODEL
    })
  );
  const retrieval = new RetrievalEngine(vectorStores.primary);
  const retrievalContext = new RetrievalContextService(
    embeddingService,
    retrieval,
    {
      maxChunks: env.RAG_MAX_CHUNKS,
      similarityThreshold: env.RAG_SIMILARITY_THRESHOLD,
      maxContextTokens: env.RAG_MAX_CONTEXT_TOKENS
    }
  );
  const chat = new ChatService(
    repositories.conversations,
    repositories.messages,
    llm,
    authorization,
    memory,
    tools,
    retrievalContext
  );
  const rag = new RagService(
    repositories.files,
    repositories.embeddings,
    embeddingService,
    new DocumentParserService(),
    new TextChunker(),
    authorization,
    retrievalContext,
    policy
  );
  const auth = new AuthService(repositories.users, redis, workspace);
  await auth.initialize();
  const agent = new AgentService(
    repositories.agents,
    repositories.conversations,
    repositories.tasks,
    tools,
    new TaskPlanner(),
    new AgentExecutor(llm, tools, retrievalContext),
    authorization,
    policy,
    logger
  );
  await agent.initialize();
  const health = new HealthService(
    postgres,
    redis,
    providerFactory,
    env.LOCAL_MODEL_BASE_URL
  );
  const fortiGate = new FortiGateClientService({
    baseUrl: env.FORTIGATE_BASE_URL,
    apiToken: env.FORTIGATE_API_TOKEN,
    vdom: env.FORTIGATE_VDOM,
    allowSelfSigned: env.FORTIGATE_ALLOW_SELF_SIGNED
  });
  const endpoints = new EndpointMonitorService(
    repositories.monitoredEndpoints,
    authorization,
    repositories.managedEndpoints,
    env.ENDPOINT_ENROLLMENT_TOKEN,
    repositories.networkDiscoveryHosts,
    fortiGate
  );
  const browserExecutablePath = resolveBrowserExecutablePath(
    env.WEBSITE_SCANNER_BROWSER_PATH
  );
  const privateMode = new CloakingService(
    repositories.privateModeConfigs,
    repositories.privateModeSessions,
    repositories.privateModeExitLogs,
    logger
  );
  const devModeConfig = getDevModeConfig();
  const verificationBypass = new VerificationBypassService(devModeConfig);
  const authorizedTestingDevelopmentLocalTargetsEnabled =
    env.NODE_ENV === "development" && env.AUTHORIZED_TESTING_DEV_MODE;
  const websiteScanner = new WebsiteScannerService(authorization, policy, {
    allowDevelopmentLocalTargets: authorizedTestingDevelopmentLocalTargetsEnabled,
    privateMode,
    browserCrawler: browserExecutablePath
      ? new HeadlessBrowserCrawler({
          executablePath: browserExecutablePath,
          allowDevelopmentLocalTargets:
            authorizedTestingDevelopmentLocalTargetsEnabled
        })
      : undefined
  });
  const securityReview = new SecurityReviewService(authorization, websiteScanner, llm, {
    defaultProvider: env.DEFAULT_LLM_PROVIDER,
    defaultModel: env.DEFAULT_LLM_MODEL
  });
  const authorizedTesting = new AuthorizedSecurityTestingService(
    authorization,
    policy,
    websiteScanner,
    llm,
    repositories.authorizedDomainVerifications,
    repositories.authorizedSecurityTestRuns,
    repositories.authorizedSecurityTestEvents,
    {
      defaultProvider: env.DEFAULT_LLM_PROVIDER,
      defaultModel: env.DEFAULT_LLM_MODEL,
      allowDevelopmentLocalTargets:
        authorizedTestingDevelopmentLocalTargetsEnabled,
      verificationBypass,
      privateMode
    }
  );
  const penetrationTesting = new PenetrationTestOrchestratorFactory({
    agents: repositories.agents,
    tasks: repositories.tasks,
    llm,
    passiveScanner: securityReview,
    activeTester: authorizedTesting,
    logger,
    defaultProvider: env.DEFAULT_LLM_PROVIDER,
    defaultModel: env.DEFAULT_LLM_MODEL
  });
  const admin = new AdminService(
    repositories.users,
    repositories.conversations,
    repositories.messages,
    repositories.files,
    repositories.toolExecutions,
    repositories.tasks,
    health,
    authorization,
    policy,
    endpoints,
    websiteScanner,
    securityReview,
    authorizedTesting,
    privateMode,
    penetrationTesting
  );

  return {
    logger,
    postgres,
    redis,
    toolRegistry,
    vectorStores,
    services: {
      auth,
      authorizedTesting,
      authorization,
      chat,
      memory,
      rag,
      agent,
      endpoints,
      llm,
      admin,
      policy,
      privateMode,
      penetrationTesting,
      tools,
      health,
      workspace
    }
  };
}
