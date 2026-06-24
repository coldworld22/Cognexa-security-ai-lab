import { Router } from "express";
import { z } from "zod";

import { EndpointController } from "../controllers/endpoint.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

const ipv4AddressPattern =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function createEndpointAgentRoutes(controller: EndpointController) {
  const router = Router();

  router.post(
    "/check-in",
    validateBody(
      z.object({
        agentId: z.string().trim().min(3).max(120),
        displayName: z.string().trim().min(1).max(80).optional(),
        hostname: z.string().trim().min(1).max(120),
        ipAddress: z.string().trim().regex(ipv4AddressPattern, "A valid IPv4 address is required."),
        macAddress: z.string().trim().min(12).max(32).optional(),
        subnet: z.string().trim().min(1).max(64).optional(),
        operatingSystem: z.string().trim().min(1).max(120),
        loggedInUser: z.string().trim().max(120).optional(),
        telemetry: z
          .object({
            cpuUsagePercent: z.number().min(0).max(100).optional(),
            memoryUsagePercent: z.number().min(0).max(100).optional(),
            diskUsagePercent: z.number().min(0).max(100).optional(),
            latencyMs: z.number().min(0).nullable().optional(),
            activeAlerts: z.number().int().min(0).optional(),
            networkRxKbps: z.number().min(0).optional(),
            networkTxKbps: z.number().min(0).optional()
          })
          .optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    ),
    asyncHandler(controller.ingestAgentHeartbeat)
  );

  return router;
}
