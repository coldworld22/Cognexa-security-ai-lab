import multer from "multer";
import { Router } from "express";
import { z } from "zod";

import { RagController } from "../controllers/rag.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

export function createRagRoutes(controller: RagController) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });

  router.post("/upload", upload.single("file"), asyncHandler(controller.upload));
  router.post(
    "/retrieve",
    validateBody(
      z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(20).default(5)
      })
    ),
    asyncHandler(controller.retrieve)
  );

  return router;
}
