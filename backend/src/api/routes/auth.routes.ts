import { Router } from "express";
import { z } from "zod";

import { AuthController } from "../controllers/auth.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

export function createAuthRoutes(controller: AuthController) {
  const router = Router();

  router.post(
    "/register",
    validateBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        displayName: z.string().min(2)
      })
    ),
    asyncHandler(controller.register)
  );

  router.post(
    "/login",
    validateBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(8)
      })
    ),
    asyncHandler(controller.login)
  );

  router.post(
    "/refresh",
    validateBody(
      z.object({
        refreshToken: z.string().min(16)
      })
    ),
    asyncHandler(controller.refresh)
  );

  return router;
}
