import { Router } from "express";

import { ToolController } from "../controllers/tool.controller";
import { asyncHandler } from "../../utils/async-handler";

export function createToolsRoutes(controller: ToolController) {
  const router = Router();
  router.get("/", asyncHandler(controller.list));
  return router;
}
