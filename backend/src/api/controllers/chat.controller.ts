import { Request, Response } from "express";

import { ChatService, ChatStreamEvent } from "../../services/chat/chat.service";
import { initializeSse, sendSseEvent } from "../../utils/streaming";

export class ChatController {
  constructor(private readonly chat: ChatService) {}

  listConversations = async (request: Request, response: Response) => {
    const conversations = await this.chat.listConversations(request.auth!);
    response.json({ conversations });
  };

  createConversation = async (request: Request, response: Response) => {
    const conversation = await this.chat.createConversation({
      actor: request.auth!,
      title: request.body.title as string,
      provider: request.body.provider as string,
      model: request.body.model as string
    });
    response.status(201).json({ conversation });
  };

  deleteConversation = async (request: Request, response: Response) => {
    await this.chat.deleteConversation(
      request.params.conversationId as string,
      request.auth!
    );
    response.status(204).send();
  };

  listMessages = async (request: Request, response: Response) => {
    const messages = await this.chat.listConversationMessages(
      request.params.conversationId as string,
      request.auth!
    );
    response.json({ messages });
  };

  postMessage = async (request: Request, response: Response) => {
    const result = await this.chat.postMessage({
      conversationId: request.params.conversationId as string,
      actor: request.auth!,
      content: request.body.content as string,
      provider: request.body.provider as string,
      model: request.body.model as string
    });
    response.status(201).json(result);
  };

  streamMessage = async (request: Request, response: Response) => {
    initializeSse(response);

    try {
      for await (const event of this.chat.streamMessage({
        conversationId: request.params.conversationId as string,
        actor: request.auth!,
        content: request.body.content as string,
        provider: request.body.provider as string,
        model: request.body.model as string
      })) {
        this.sendStreamEvent(response, event);
      }

      sendSseEvent(response, "done", { ok: true });
    } catch (error) {
      sendSseEvent(response, "error", {
        error: error instanceof Error ? error.message : "Streaming request failed."
      });
    }

    response.end();
  };

  private sendStreamEvent(response: Response, event: ChatStreamEvent) {
    if (event.type === "sources") {
      sendSseEvent(response, "sources", {
        sources: event.sources
      });
      return;
    }

    sendSseEvent(response, "token", event.chunk);
  }
}
