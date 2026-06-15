import { Router } from "express";
import { z } from "zod";

import { ChatController } from "../controllers/chat.controller";
import { asyncHandler } from "../../utils/async-handler";
import { validateBody } from "../middlewares/validate.middleware";

export function createChatRoutes(controller: ChatController) {
  const router = Router();

  router.get("/conversations", asyncHandler(controller.listConversations));
  router.post(
    "/conversations",
    validateBody(
      z.object({
        title: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1)
      })
    ),
    asyncHandler(controller.createConversation)
  );
  router.get(
    "/conversations/:conversationId/messages",
    asyncHandler(controller.listMessages)
  );
  router.post(
    "/conversations/:conversationId/messages",
    validateBody(
      z.object({
        content: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1)
      })
    ),
    asyncHandler(controller.postMessage)
  );
  router.post(
    "/conversations/:conversationId/stream",
    validateBody(
      z.object({
        content: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1)
      })
    ),
    asyncHandler(controller.streamMessage)
  );

  return router;
}
