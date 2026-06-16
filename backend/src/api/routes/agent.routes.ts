import { Router } from "express";
import { z } from "zod";

import { AgentController } from "../controllers/agent.controller";
import { asyncHandler } from "../../utils/async-handler";
import {
  validateBody,
  validateParams,
  validateQuery
} from "../middlewares/validate.middleware";

export function createAgentRoutes(controller: AgentController) {
  const router = Router();

  router.get(
    "/tasks",
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20)
      })
    ),
    asyncHandler(controller.listTasks)
  );

  router.get(
    "/tasks/:taskId",
    validateParams(
      z.object({
        taskId: z.string().uuid()
      })
    ),
    asyncHandler(controller.getTask)
  );

  router.post(
    "/execute",
    validateBody(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        instructions: z.string().min(1),
        enabledTools: z.array(z.string()).default([]),
        objective: z.string().min(1),
        conversationId: z.string().uuid().optional()
      })
    ),
    asyncHandler(controller.execute)
  );

  return router;
}
