import { Router } from "express";
import { z } from "zod";

import { AgentController } from "../controllers/agent.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

export function createAgentRoutes(controller: AgentController) {
  const router = Router();

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
