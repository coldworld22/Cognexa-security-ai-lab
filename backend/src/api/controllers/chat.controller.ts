import { Request, Response } from "express";

import { ChatService } from "../../services/chat/chat.service";
import { initializeSse, sendSseEvent } from "../../utils/streaming";

export class ChatController {
  constructor(private readonly chat: ChatService) {}

  listConversations = async (request: Request, response: Response) => {
    const conversations = await this.chat.listConversations(request.auth!.userId);
    response.json({ conversations });
  };

  createConversation = async (request: Request, response: Response) => {
    const conversation = await this.chat.createConversation({
      userId: request.auth!.userId,
      title: request.body.title as string,
      provider: request.body.provider as string,
      model: request.body.model as string
    });
    response.status(201).json({ conversation });
  };

  listMessages = async (request: Request, response: Response) => {
    const messages = await this.chat.listConversationMessages(
      request.params.conversationId as string,
      request.auth!.userId
    );
    response.json({ messages });
  };

  postMessage = async (request: Request, response: Response) => {
    const result = await this.chat.postMessage({
      conversationId: request.params.conversationId as string,
      userId: request.auth!.userId,
      content: request.body.content as string,
      provider: request.body.provider as string,
      model: request.body.model as string
    });
    response.status(201).json(result);
  };

  streamMessage = async (request: Request, response: Response) => {
    initializeSse(response);

    for await (const chunk of this.chat.streamMessage({
      conversationId: request.params.conversationId as string,
      userId: request.auth!.userId,
      content: request.body.content as string,
      provider: request.body.provider as string,
      model: request.body.model as string
    })) {
      sendSseEvent(response, "token", chunk);
    }

    sendSseEvent(response, "done", { ok: true });
    response.end();
  };
}
