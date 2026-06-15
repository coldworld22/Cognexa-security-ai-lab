import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { LLMMessage } from "../../llm/base-llm-provider";
import { LLMService } from "../llm/llm.service";
import { MemoryService } from "../memory/memory.service";
import { AppError } from "../../utils/app-error";

interface CreateConversationInput {
  userId: string;
  title: string;
  provider: string;
  model: string;
}

interface PostMessageInput {
  conversationId: string;
  userId: string;
  content: string;
  provider: string;
  model: string;
}

export class ChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly llm: LLMService,
    private readonly memory: MemoryService
  ) {}

  async listConversations(userId: string) {
    return this.conversations.listByUser(userId);
  }

  async createConversation(input: CreateConversationInput) {
    return this.conversations.create({
      userId: input.userId,
      title: input.title,
      modelProvider: input.provider,
      modelName: input.model
    });
  }

  async listMessages(conversationId: string) {
    return this.messages.listByConversation(conversationId);
  }

  async listConversationMessages(conversationId: string, userId: string) {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new AppError("Conversation not found", 404);
    }

    return this.messages.listByConversation(conversationId);
  }

  async postMessage(input: PostMessageInput) {
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      throw new AppError("Conversation not found", 404);
    }

    await this.messages.create({
      conversationId: input.conversationId,
      role: "user",
      content: input.content
    });
    await this.conversations.touch(input.conversationId);

    const llmMessages = await this.buildLlmMessages(
      input.userId,
      input.conversationId,
      true
    );

    const reply = await this.llm.createReply({
      provider: input.provider,
      model: input.model,
      messages: llmMessages
    });

    const assistantMessage = await this.messages.create({
      conversationId: input.conversationId,
      role: "assistant",
      content: reply.content,
      metadata: {
        usage: reply.usage
      }
    });
    await this.conversations.touch(input.conversationId);

    return {
      reply: assistantMessage,
      usage: reply.usage
    };
  }

  async *streamMessage(input: PostMessageInput) {
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      throw new AppError("Conversation not found", 404);
    }

    await this.messages.create({
      conversationId: input.conversationId,
      role: "user",
      content: input.content
    });
    await this.conversations.touch(input.conversationId);

    const llmMessages = await this.buildLlmMessages(
      input.userId,
      input.conversationId,
      true
    );

    let responseText = "";
    for await (const chunk of this.llm.streamReply({
      provider: input.provider,
      model: input.model,
      messages: llmMessages
    })) {
      responseText += chunk.delta;
      yield chunk;
    }

    await this.messages.create({
      conversationId: input.conversationId,
      role: "assistant",
      content: responseText
    });
    await this.conversations.touch(input.conversationId);
  }

  private async buildLlmMessages(
    userId: string,
    conversationId: string,
    includeMemoryContext: boolean
  ): Promise<LLMMessage[]> {
    const [context, history] = await Promise.all([
      includeMemoryContext ? this.memory.getUserContext(userId) : Promise.resolve(null),
      this.messages.listByConversation(conversationId)
    ]);

    const systemMessages: LLMMessage[] = [
      {
        role: "system",
        content:
          "You are Security AI Lab, a self-hosted assistant focused on security operations, engineering, and retrieval-aware reasoning."
      }
    ];

    if (context) {
      systemMessages.push({
        role: "system",
        content: `Known preferences and memories: ${JSON.stringify(context.preferences)}`
      });
    }

    return [
      ...systemMessages,
      ...history.map((message) => ({
        role: message.role === "tool" ? "assistant" : message.role,
        content: message.content
      }))
    ];
  }
}
