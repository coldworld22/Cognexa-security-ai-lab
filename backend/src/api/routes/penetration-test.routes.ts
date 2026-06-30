import { Router } from "express";
import { z } from "zod";

import { AuthorizationService } from "../../services/authorization/authorization.service";
import { asyncHandler } from "../../utils/async-handler";
import { PenetrationTestController } from "../controllers/penetration-test.controller";
import { authorize } from "../middlewares/authorization.middleware";
import {
  validateBody,
  validateParams,
  validateQuery
} from "../middlewares/validate.middleware";

export function createPenetrationTestRoutes(
  controller: PenetrationTestController,
  authorization: AuthorizationService
) {
  const router = Router();

  const authProfileSchema = z.object({
    name: z.string().trim().min(1),
    role: z.enum(["anonymous", "low_privilege", "high_privilege"]),
    headers: z.record(z.string(), z.string()).optional(),
    cookies: z.record(z.string(), z.string()).optional()
  });
  const authEndpointDescriptorSchema = z.object({
    type: z.literal("auth_api"),
    name: z.string().trim().min(1),
    entryUrl: z.string().trim().min(1),
    endpoint: z.string().trim().min(1),
    method: z.literal("POST").optional(),
    contentType: z.string().trim().min(1).max(120).optional(),
    fields: z.array(z.string().trim().min(1)).min(1).max(12),
    tokenFields: z.array(z.string().trim().min(1)).max(8).optional(),
    stagingOnly: z.boolean().optional(),
    productionMode: z.literal("passive_only").optional()
  });
  const manualFormValidationSchema = z.object({
    rateLimitPerMinute: z.coerce.number().int().min(1).max(60).default(5),
    credentialLabels: z.array(z.string().trim().min(1)).min(1).max(8),
    notes: z.string().trim().min(1).max(400).optional()
  });

  router.get(
    "/",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.advanced-runs",
      action: "GET /admin/authorized-testing/advanced-runs"
    }),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20)
      })
    ),
    asyncHandler(controller.listRuns)
  );

  router.get(
    "/:runId",
    authorize(authorization, "admin_dashboard", {
      resource: (request) =>
        `admin.authorized-testing.advanced-runs.${request.params.runId}`,
      action: "GET /admin/authorized-testing/advanced-runs/:runId"
    }),
    validateParams(
      z.object({
        runId: z.string().uuid()
      })
    ),
    asyncHandler(controller.getRun)
  );

  router.get(
    "/:runId/report",
    authorize(authorization, "admin_dashboard", {
      resource: (request) =>
        `admin.authorized-testing.advanced-runs.${request.params.runId}.report`,
      action: "GET /admin/authorized-testing/advanced-runs/:runId/report"
    }),
    validateParams(
      z.object({
        runId: z.string().uuid()
      })
    ),
    asyncHandler(controller.getReport)
  );

  router.post(
    "/stream",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.advanced-runs",
      action: "POST /admin/authorized-testing/advanced-runs/stream"
    }),
    validateBody(
      z.object({
        target: z.string().trim().min(1),
        verificationId: z.string().uuid(),
        maxPages: z.coerce.number().int().min(1).max(8).optional(),
        maxRequests: z.coerce.number().int().min(6).max(40).optional(),
        conversationId: z.string().uuid().optional(),
        authProfiles: z.array(authProfileSchema).max(4).optional(),
        authEndpointDescriptors: z.array(authEndpointDescriptorSchema).max(6).optional(),
        manualFormValidation: manualFormValidationSchema.optional()
      })
    ),
    asyncHandler(controller.startStream)
  );

  return router;
}
