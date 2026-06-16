import {
  AccessContext,
  Permission
} from "../../authorization/authorization.types";
import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { LLMMessage, LLMStreamChunk } from "../../llm/base-llm-provider";
import { LLMService } from "../llm/llm.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { MemoryService } from "../memory/memory.service";
import { AppError } from "../../utils/app-error";
import { ToolExecutionService } from "../tool-execution/tool-execution.service";
import { RetrievalContextService } from "../rag/retrieval-context.service";
import { RetrievalContextMetadata } from "../../rag/retrieval/retrieval-context.types";
import { canManageWorkspace } from "../../workspaces/workspace.types";

interface CreateConversationInput {
  title: string;
  provider: string;
  model: string;
}

interface PostMessageInput {
  conversationId: string;
  content: string;
  provider: string;
  model: string;
}

interface BuiltChatPrompt {
  messages: LLMMessage[];
  retrieval?: RetrievalContextMetadata;
}

export type ChatStreamEvent =
  | {
      type: "sources";
      sources: RetrievalContextMetadata["sources"];
    }
  | {
      type: "token";
      chunk: LLMStreamChunk;
    };

export class ChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly llm: LLMService,
    private readonly authorization: AuthorizationService,
    private readonly memory: MemoryService,
    private readonly tools: ToolExecutionService,
    private readonly retrievalContext: RetrievalContextService
  ) {}

  async listConversations(actor: AccessContext) {
    await this.assertChatPermission(actor, "chat.conversations", "list_conversations");
    return this.conversations.listByWorkspace(actor.workspaceId);
  }

  async deleteConversation(conversationId: string, actor: AccessContext) {
    await this.assertChatPermission(actor, `chat.conversations.${conversationId}`, "delete_conversation");
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || conversation.workspaceId !== actor.workspaceId) {
      throw new AppError("Conversation not found", 404);
    }

    if (
      conversation.userId !== actor.userId &&
      !canManageWorkspace(actor.workspaceRole)
    ) {
      throw new AppError("Only the conversation creator or a workspace admin can delete it", 403);
    }

    const deleted = await this.conversations.deleteById(conversationId, actor.workspaceId);
    if (!deleted) {
      throw new AppError("Conversation not found", 404);
    }
  }

  async createConversation(input: CreateConversationInput & { actor: AccessContext }) {
    await this.assertChatPermission(input.actor, "chat.conversations", "create_conversation");
    return this.conversations.create({
      workspaceId: input.actor.workspaceId,
      userId: input.actor.userId,
      title: input.title,
      modelProvider: input.provider,
      modelName: input.model
    });
  }

  async listConversationMessages(conversationId: string, actor: AccessContext) {
    await this.assertChatPermission(actor, `chat.conversations.${conversationId}.messages`, "list_messages");
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || conversation.workspaceId !== actor.workspaceId) {
      throw new AppError("Conversation not found", 404);
    }

    return this.messages.listByConversation(conversationId);
  }

  async postMessage(input: PostMessageInput & { actor: AccessContext }) {
    await this.assertChatPermission(input.actor, `chat.conversations.${input.conversationId}.messages`, "post_message");
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation || conversation.workspaceId !== input.actor.workspaceId) {
      throw new AppError("Conversation not found", 404);
    }

    await this.messages.create({
      workspaceId: input.actor.workspaceId,
      conversationId: input.conversationId,
      role: "user",
      content: input.content
    });
    await this.conversations.touch(input.conversationId);

    const prompt = await this.buildLlmMessages(
      input.actor,
      input.conversationId,
      true,
      input.content
    );

    const reply = await this.llm.createReply({
      provider: input.provider,
      model: input.model,
      messages: prompt.messages
    });

    const assistantMessage = await this.messages.create({
      workspaceId: input.actor.workspaceId,
      conversationId: input.conversationId,
      role: "assistant",
      content: reply.content,
      metadata: {
        usage: reply.usage,
        retrieval: prompt.retrieval
      }
    });
    await this.conversations.touch(input.conversationId);

    return {
      reply: assistantMessage,
      usage: reply.usage,
      sources: prompt.retrieval?.sources ?? []
    };
  }

  async *streamMessage(input: PostMessageInput & { actor: AccessContext }) {
    await this.assertChatPermission(input.actor, `chat.conversations.${input.conversationId}.messages`, "stream_message");
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation || conversation.workspaceId !== input.actor.workspaceId) {
      throw new AppError("Conversation not found", 404);
    }

    await this.messages.create({
      workspaceId: input.actor.workspaceId,
      conversationId: input.conversationId,
      role: "user",
      content: input.content
    });
    await this.conversations.touch(input.conversationId);

    const prompt = await this.buildLlmMessages(
      input.actor,
      input.conversationId,
      true,
      input.content
    );

    if ((prompt.retrieval?.sources.length ?? 0) > 0) {
      yield {
        type: "sources" as const,
        sources: prompt.retrieval!.sources
      };
    }

    let responseText = "";
    for await (const chunk of this.llm.streamReply({
      provider: input.provider,
      model: input.model,
      messages: prompt.messages
    })) {
      responseText += chunk.delta;
      yield {
        type: "token" as const,
        chunk
      };
    }

    await this.messages.create({
      workspaceId: input.actor.workspaceId,
      conversationId: input.conversationId,
      role: "assistant",
      content: responseText,
      metadata: {
        retrieval: prompt.retrieval
      }
    });
    await this.conversations.touch(input.conversationId);
  }

  private async buildLlmMessages(
    actor: AccessContext,
    conversationId: string,
    includeMemoryContext: boolean,
    latestUserInput?: string
  ): Promise<BuiltChatPrompt> {
    const [context, history, websiteContext, retrieval] = await Promise.all([
      includeMemoryContext ? this.resolveMemoryContext(actor) : Promise.resolve(null),
      this.messages.listByConversation(conversationId),
      latestUserInput
        ? this.resolveWebsiteContext(actor, latestUserInput)
        : Promise.resolve<LLMMessage[]>([]),
      this.resolveRetrievedContext(actor, latestUserInput)
    ]);

    const now = new Date();
    const systemMessages: LLMMessage[] = [
      {
        role: "system",
        content:
          "You are Security AI Lab, a self-hosted assistant focused on security operations, engineering, and retrieval-aware reasoning. Respond in the same language as the latest user message unless they explicitly ask for another language."
      },
      {
        role: "system",
        content: `Current server time (UTC): ${now.toISOString()}. Use this timestamp as the authoritative current date/time when the user asks time-sensitive questions.`
      }
    ];

    if (context) {
      systemMessages.push({
        role: "system",
        content: `Known preferences and memories: ${JSON.stringify(context.preferences)}`
      });
    }

    if (retrieval?.contextMessage) {
      systemMessages.push({
        role: "system",
        content: retrieval.contextMessage
      });
    }

    systemMessages.push(...websiteContext);

    return {
      messages: [
        ...systemMessages,
        ...history.map((message) => ({
          role: message.role === "tool" ? "assistant" : message.role,
          content: message.content
        }))
      ],
      retrieval: retrieval?.metadata
    };
  }

  private async resolveWebsiteContext(
    actor: AccessContext,
    input: string
  ): Promise<LLMMessage[]> {
    if (!(await this.hasPermission(actor, "tools"))) {
      return [];
    }

    const urls = this.extractUrls(input).slice(0, 2);
    if (urls.length === 0) {
      return [];
    }

    const toolResponses = await Promise.all(
      urls.map((url) =>
        this.tools.execute("web-search", {
          url,
          maxContentChars: 3200
        }, {
          actor,
          resource: `chat.website_context.${url}`,
          action: "fetch_website_context",
          reason: "Website context extraction requires 'tools' permission",
          metadata: {
            conversationInput: true
          }
        })
      )
    );

    return toolResponses
      .flatMap((response) => {
        const result = (response as { results?: Array<Record<string, unknown>> }).results?.[0];
        if (!result) {
          return [];
        }

        const title = String(result.title ?? "Untitled page");
        const finalUrl = String(result.finalUrl ?? result.url ?? "");
        const description = String(result.description ?? "");
        const headings = Array.isArray(result.headings)
          ? result.headings.map((heading) => String(heading)).slice(0, 6)
          : [];
        const content = String(result.content ?? "");

        const sections = [
          "The user provided a public webpage URL. Treat this as a website content understanding task unless they explicitly ask for security testing.",
          `Fetched public website context for ${finalUrl}.`,
          `Title: ${title}`,
          description ? `Description: ${description}` : "",
          headings.length > 0 ? `Headings: ${headings.join(" | ")}` : "",
          `Page content excerpt:\n${content}`
        ].filter(Boolean);

        return [
          {
            role: "system" as const,
            content: sections.join("\n")
          }
        ];
      });
  }

  private extractUrls(input: string): string[] {
    const matches = input.match(/https?:\/\/[^\s)>\]]+/gi) ?? [];
    return Array.from(new Set(matches.map((url) => url.trim())));
  }

  private async resolveRetrievedContext(
    actor: AccessContext,
    latestUserInput?: string
  ) {
    if (!latestUserInput || !(await this.hasPermission(actor, "rag"))) {
      return null;
    }

    try {
      return await this.retrievalContext.buildPromptContext({
        workspaceId: actor.workspaceId,
        query: latestUserInput
      });
    } catch {
      return null;
    }
  }

  private async assertChatPermission(
    actor: AccessContext,
    resource: string,
    action: string
  ): Promise<void> {
    await this.authorization.assertPermission(actor, "chat", {
      layer: "service",
      resource,
      action,
      reason: "Chat workflow requires 'chat' permission"
    });
  }

  private async resolveMemoryContext(actor: AccessContext) {
    if (!(await this.hasPermission(actor, "memory"))) {
      return null;
    }

    return this.memory.getUserContext(actor);
  }

  private async hasPermission(
    actor: AccessContext,
    permission: Permission
  ): Promise<boolean> {
    const permissions = await this.authorization.getPermissionsForActor(actor);
    return permissions.includes(permission);
  }
}
