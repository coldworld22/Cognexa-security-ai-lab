import { Router } from "express";
import { z } from "zod";

import { WorkspaceController } from "../controllers/workspace.controller";
import { asyncHandler } from "../../utils/async-handler";
import {
  validateBody,
  validateParams
} from "../middlewares/validate.middleware";

const workspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);

export function createWorkspaceRoutes(controller: WorkspaceController) {
  const router = Router();

  router.get("/", asyncHandler(controller.listSession));
  router.post(
    "/",
    validateBody(
      z.object({
        name: z.string().min(1),
        organizationName: z.string().min(1).optional()
      })
    ),
    asyncHandler(controller.createWorkspace)
  );
  router.post(
    "/switch",
    validateBody(
      z.object({
        workspaceId: z.string().uuid()
      })
    ),
    asyncHandler(controller.switchWorkspace)
  );
  router.post(
    "/current/invitations",
    validateBody(
      z.object({
        email: z.string().email(),
        role: workspaceRoleSchema.default("member")
      })
    ),
    asyncHandler(controller.inviteMember)
  );
  router.post(
    "/invitations/:invitationId/accept",
    validateParams(
      z.object({
        invitationId: z.string().uuid()
      })
    ),
    asyncHandler(controller.acceptInvitation)
  );

  return router;
}
