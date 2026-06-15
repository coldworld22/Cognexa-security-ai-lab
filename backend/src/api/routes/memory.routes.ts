import { Router } from "express";
import { z } from "zod";

import { MemoryController } from "../controllers/memory.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

export function createMemoryRoutes(controller: MemoryController) {
  const router = Router();

  router.get("/context", asyncHandler(controller.getContext));
  router.post(
    "/preferences",
    validateBody(
      z.object({
        key: z.string().min(1),
        value: z.string().min(1)
      })
    ),
    asyncHandler(controller.savePreference)
  );

  return router;
}
