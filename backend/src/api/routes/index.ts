import { Router } from "express";

import { AppContext } from "../../bootstrap/app-context";
import { authMiddleware } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/authorization.middleware";
import { AdminController } from "../controllers/admin.controller";
import { AgentController } from "../controllers/agent.controller";
import { AuthController } from "../controllers/auth.controller";
import { ChatController } from "../controllers/chat.controller";
import { EndpointController } from "../controllers/endpoint.controller";
import { LLMController } from "../controllers/llm.controller";
import { MemoryController } from "../controllers/memory.controller";
import { PenetrationTestController } from "../controllers/penetration-test.controller";
import { PolicyController } from "../controllers/policy.controller";
import { RagController } from "../controllers/rag.controller";
import { ToolController } from "../controllers/tool.controller";
import { WorkspaceController } from "../controllers/workspace.controller";
import { createAdminRoutes } from "./admin.routes";
import { createAgentRoutes } from "./agent.routes";
import {
  createAuthenticatedAuthRoutes,
  createPublicAuthRoutes
} from "./auth.routes";
import { createChatRoutes } from "./chat.routes";
import { createEndpointAgentRoutes } from "./endpoint-agents.routes";
import { createEndpointRoutes } from "./endpoints.routes";
import { createLlmRoutes } from "./llm.routes";
import { createMemoryRoutes } from "./memory.routes";
import { createPenetrationTestRoutes } from "./penetration-test.routes";
import { createRagRoutes } from "./rag.routes";
import { createToolsRoutes } from "./tools.routes";
import { createWorkspaceRoutes } from "./workspace.routes";

export function createApiRouter(context: AppContext) {
  const router = Router();
  const authController = new AuthController(context.services.auth);
  const chatController = new ChatController(context.services.chat);
  const endpointController = new EndpointController(context.services.endpoints);
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
  const penetrationTestController = new PenetrationTestController(
    context.services.admin,
    context.logger
  );
  const policyController = new PolicyController(context.services.policy);

  router.use("/auth", createPublicAuthRoutes(authController));
  router.use("/endpoint-agents", createEndpointAgentRoutes(endpointController));
  router.use(authMiddleware(context.services.auth, context.services.authorization));
  router.use("/auth", createAuthenticatedAuthRoutes(authController));
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
    "/endpoints",
    authorize(context.services.authorization, "agents", {
      resource: "endpoints",
      action: "route_access"
    }),
    createEndpointRoutes(endpointController)
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
    "/admin/authorized-testing/advanced-runs",
    createPenetrationTestRoutes(
      penetrationTestController,
      context.services.authorization
    )
  );
  router.use(
    "/admin",
    createAdminRoutes(
      adminController,
      policyController,
      context.services.authorization
    )
  );

  return router;
}
