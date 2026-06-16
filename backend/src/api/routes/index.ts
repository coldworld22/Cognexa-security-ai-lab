import { Router } from "express";

import { AppContext } from "../../bootstrap/app-context";
import { authMiddleware } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/authorization.middleware";
import { AdminController } from "../controllers/admin.controller";
import { AgentController } from "../controllers/agent.controller";
import { AuthController } from "../controllers/auth.controller";
import { ChatController } from "../controllers/chat.controller";
import { LLMController } from "../controllers/llm.controller";
import { MemoryController } from "../controllers/memory.controller";
import { RagController } from "../controllers/rag.controller";
import { ToolController } from "../controllers/tool.controller";
import { WorkspaceController } from "../controllers/workspace.controller";
import { createAdminRoutes } from "./admin.routes";
import { createAgentRoutes } from "./agent.routes";
import { createAuthRoutes } from "./auth.routes";
import { createChatRoutes } from "./chat.routes";
import { createLlmRoutes } from "./llm.routes";
import { createMemoryRoutes } from "./memory.routes";
import { createRagRoutes } from "./rag.routes";
import { createToolsRoutes } from "./tools.routes";
import { createWorkspaceRoutes } from "./workspace.routes";

export function createApiRouter(context: AppContext) {
  const router = Router();
  const authController = new AuthController(context.services.auth);
  const chatController = new ChatController(context.services.chat);
  const llmController = new LLMController(context.services.llm);
  const memoryController = new MemoryController(context.services.memory);
  const ragController = new RagController(context.services.rag);
  const agentController = new AgentController(context.services.agent);
  const toolController = new ToolController(context.services.tools);
  const workspaceController = new WorkspaceController(
    context.services.workspace,
    context.services.authorization
  );
  const adminController = new AdminController(
    context.services.admin,
    context.services.tools
  );

  router.use("/auth", createAuthRoutes(authController));
  router.use(authMiddleware(context.services.auth, context.services.authorization));
  router.use("/workspaces", createWorkspaceRoutes(workspaceController));
  router.use(
    "/chat",
    authorize(context.services.authorization, "chat", {
      resource: "chat",
      action: "route_access"
    }),
    createChatRoutes(chatController)
  );
  router.use("/llm", createLlmRoutes(llmController));
  router.use(
    "/memory",
    authorize(context.services.authorization, "memory", {
      resource: "memory",
      action: "route_access"
    }),
    createMemoryRoutes(memoryController)
  );
  router.use(
    "/rag",
    authorize(context.services.authorization, "rag", {
      resource: "rag",
      action: "route_access"
    }),
    createRagRoutes(ragController)
  );
  router.use(
    "/agents",
    authorize(context.services.authorization, "agents", {
      resource: "agents",
      action: "route_access"
    }),
    createAgentRoutes(agentController)
  );
  router.use(
    "/tools",
    authorize(context.services.authorization, "tools", {
      resource: "tools",
      action: "route_access"
    }),
    createToolsRoutes(toolController)
  );
  router.use(
    "/admin",
    createAdminRoutes(adminController, context.services.authorization)
  );

  return router;
}
