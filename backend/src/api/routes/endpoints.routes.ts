import { Router } from "express";
import { z } from "zod";

import { EndpointController } from "../controllers/endpoint.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

const ipv4AddressPattern =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function createEndpointRoutes(controller: EndpointController) {
  const router = Router();

  router.get("/", asyncHandler(controller.listInventory));

  router.post(
    "/",
    validateBody(
      z.object({
        displayName: z.string().trim().min(1).max(80),
        hostname: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9.-]+$/),
        ipAddress: z.string().trim().regex(ipv4AddressPattern, "A valid IPv4 address is required."),
        subnet: z.string().trim().min(1).max(64),
        operatingSystem: z.string().trim().min(1).max(80),
        loggedInUser: z.string().trim().max(80).optional(),
        tags: z.array(z.string().trim().min(1).max(24)).max(12).default([])
      })
    ),
    asyncHandler(controller.createEndpoint)
  );

  router.post("/discover", asyncHandler(controller.discoverEndpoints));
  router.post("/refresh", asyncHandler(controller.refreshInventory));

  return router;
}
