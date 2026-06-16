import { Router } from "express";
import { z } from "zod";

import { authorize } from "../middlewares/authorization.middleware";
import { AdminController } from "../controllers/admin.controller";
import { asyncHandler } from "../../utils/async-handler";
import {
  validateBody,
  validateParams,
  validateQuery
} from "../middlewares/validate.middleware";
import { AuthorizationService } from "../../services/authorization/authorization.service";

export function createAdminRoutes(
  controller: AdminController,
  authorization: AuthorizationService
) {
  const router = Router();
  router.get(
    "/dashboard",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.dashboard",
      action: "GET /admin/dashboard"
    }),
    asyncHandler(controller.dashboard)
  );
  router.get(
    "/users",
    authorize(authorization, "user_management", {
      resource: "admin.users",
      action: "GET /admin/users"
    }),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50)
      })
    ),
    asyncHandler(controller.listUsers)
  );
  router.patch(
    "/users/:userId/role",
    authorize(authorization, "user_management", {
      resource: (request) => `admin.users.${request.params.userId}.role`,
      action: "PATCH /admin/users/:userId/role"
    }),
    validateParams(
      z.object({
        userId: z.string().uuid()
      })
    ),
    validateBody(
      z.object({
        role: z.enum(["super_admin", "admin", "manager", "developer", "viewer"])
      })
    ),
    asyncHandler(controller.updateUserRole)
  );
  return router;
}
