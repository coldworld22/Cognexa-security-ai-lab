import { Router } from "express";

import { LLMController } from "../controllers/llm.controller";
import { asyncHandler } from "../../utils/async-handler";

export function createLlmRoutes(controller: LLMController) {
  const router = Router();
  router.get("/providers", asyncHandler(controller.listProviders));
  return router;
}
