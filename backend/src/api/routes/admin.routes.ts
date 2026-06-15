import { Router } from "express";

import { AdminController } from "../controllers/admin.controller";
import { asyncHandler } from "../../utils/async-handler";

export function createAdminRoutes(controller: AdminController) {
  const router = Router();
  router.get("/dashboard", asyncHandler(controller.dashboard));
  return router;
}
