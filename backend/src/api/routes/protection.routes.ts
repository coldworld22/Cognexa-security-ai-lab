import { Router } from "express";
import { z } from "zod";

import { POLICY_CATEGORIES } from "../../policy/policy.types";
import { AuthorizationService } from "../../services/authorization/authorization.service";
import {
  PRIVATE_MODE_OUTBOUND_STRATEGIES,
  TLS_FINGERPRINT_PROFILES
} from "../../services/private-mode/private-mode.types";
import { asyncHandler } from "../../utils/async-handler";
import { authorize } from "../middlewares/authorization.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { ProtectionController } from "../controllers/protection.controller";

export function createProtectionRoutes(
  controller: ProtectionController,
  authorization: AuthorizationService
) {
  const router = Router();
  const activationSchema = z.object({
    outboundStrategy: z.enum(PRIVATE_MODE_OUTBOUND_STRATEGIES).optional(),
    torControlPort: z.coerce.number().int().positive().max(65535).optional(),
    torSocksPort: z.coerce.number().int().positive().max(65535).optional(),
    dnsOverTor: z.boolean().optional(),
    exitGeographyPreference: z.array(z.string().trim().min(1)).max(12).optional(),
    circuitRotationInterval: z.coerce.number().int().positive().max(86400).optional(),
    tlsFingerprintProfile: z.enum(TLS_FINGERPRINT_PROFILES).optional(),
    requestTimingJitter: z.coerce.number().int().min(0).max(10000).optional(),
    enabledCategories: z.array(z.enum(POLICY_CATEGORIES)).min(1).max(10).optional()
  });

  router.post(
    "/activate",
    authorize(authorization, "admin_dashboard", {
      resource: "protection.activate",
      action: "POST /protection/activate"
    }),
    validateBody(activationSchema),
    asyncHandler(controller.activate)
  );

  router.post(
    "/deactivate",
    authorize(authorization, "admin_dashboard", {
      resource: "protection.deactivate",
      action: "POST /protection/deactivate"
    }),
    asyncHandler(controller.deactivate)
  );

  router.get(
    "/status",
    authorize(authorization, "admin_dashboard", {
      resource: "protection.status",
      action: "GET /protection/status"
    }),
    asyncHandler(controller.status)
  );

  return router;
}
