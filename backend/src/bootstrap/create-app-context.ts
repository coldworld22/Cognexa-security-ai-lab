import { createLogger } from "../config/logger";
import { createPostgresPool } from "../database/postgres";
import { createRedisClient } from "../database/redis";
import { UserRepository } from "../database/repositories/user.repository";
import { ConversationRepository } from "../database/repositories/conversation.repository";
import { MessageRepository } from "../database/repositories/message.repository";
import { MemoryRepository } from "../database/repositories/memory.repository";
import { FileRepository } from "../database/repositories/file.repository";
import { EmbeddingRepository } from "../database/repositories/embedding.repository";
import { AgentRepository } from "../database/repositories/agent.repository";
import { TaskRepository } from "../database/repositories/task.repository";
import { ToolExecutionRepository } from "../database/repositories/tool-execution.repository";
import { PgVectorStore } from "../rag/vector-stores/pgvector.store";
import { QdrantVectorStore } from "../rag/vector-stores/qdrant.store";
import { ProviderFactory } from "../llm/provider-factory";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { registerDefaultTools } from "../tools/register-default-tools";
import { ToolExecutionService } from "../services/tool-execution/tool-execution.service";
import { LLMService } from "../services/llm/llm.service";
import { AuthService } from "../services/auth/auth.service";
import { MemoryService } from "../services/memory/memory.service";
import { ChatService } from "../services/chat/chat.service";
import { RagService } from "../services/rag/rag.service";
import { AgentService } from "../services/agent/agent.service";
import { AdminService } from "../services/admin/admin.service";
import { HealthService } from "../services/health/health.service";
import { DocumentParserService } from "../rag/ingestion/document-parser.service";
import { TextChunker } from "../rag/chunking/text-chunker";
import { RetrievalEngine } from "../rag/retrieval/retrieval-engine";
import { TaskPlanner } from "../agent/planner/task-planner";
import { AgentExecutor } from "../agent/execution/agent-executor";
import { env } from "../config/env";
import { AppContext } from "./app-context";

export async function createAppContext(): Promise<AppContext> {
  const logger = createLogger();
  const postgres = createPostgresPool(env.POSTGRES_URL);
  const redis = createRedisClient(env.REDIS_URL);
  await redis.connect();

  const repositories = {
    users: new UserRepository(postgres),
    conversations: new ConversationRepository(postgres),
    messages: new MessageRepository(postgres),
    memories: new MemoryRepository(postgres),
    files: new FileRepository(postgres),
    embeddings: new EmbeddingRepository(postgres),
    agents: new AgentRepository(postgres),
    tasks: new TaskRepository(postgres),
    toolExecutions: new ToolExecutionRepository(postgres)
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

  const tools = new ToolExecutionService(toolRegistry, repositories.toolExecutions);
  const llm = new LLMService(providerFactory, tools);
  const memory = new MemoryService(repositories.memories, repositories.messages);
  const chat = new ChatService(
    repositories.conversations,
    repositories.messages,
    llm,
    memory
  );
  const rag = new RagService(
    repositories.files,
    repositories.embeddings,
    new DocumentParserService(),
    new TextChunker(),
    new RetrievalEngine(vectorStores.primary)
  );
  const agent = new AgentService(
    repositories.agents,
    repositories.tasks,
    new TaskPlanner(),
    new AgentExecutor(llm, tools)
  );
  const auth = new AuthService(repositories.users, redis);
  const admin = new AdminService(
    repositories.users,
    repositories.conversations,
    repositories.messages,
    repositories.toolExecutions,
    repositories.tasks
  );
  const health = new HealthService(postgres, redis, providerFactory);

  return {
    logger,
    postgres,
    redis,
    toolRegistry,
    vectorStores,
    services: {
      auth,
      chat,
      memory,
      rag,
      agent,
      llm,
      admin,
      tools,
      health
    }
  };
}
