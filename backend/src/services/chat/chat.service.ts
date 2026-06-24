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
import { inferPolicyCategoriesFromText } from "../../policy/policy.types";

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

interface DirectSearchReply {
  content: string;
  metadata: Record<string, unknown>;
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

    const directSearchReply = await this.buildDirectSearchReply(
      input.actor,
      input.content
    );
    if (directSearchReply) {
      const assistantMessage = await this.messages.create({
        workspaceId: input.actor.workspaceId,
        conversationId: input.conversationId,
        role: "assistant",
        content: directSearchReply.content,
        metadata: directSearchReply.metadata
      });
      await this.conversations.touch(input.conversationId);

      return {
        reply: assistantMessage,
        usage: {
          inputTokens: 0,
          outputTokens: 0
        },
        sources: []
      };
    }

    const prompt = await this.buildLlmMessages(
      input.actor,
      input.conversationId,
      true,
      input.content
    );

    const reply = await this.llm.createReply({
      provider: input.provider,
      model: input.model,
      messages: prompt.messages,
      policy: {
        actor: input.actor,
        action: "chat.post_message",
        categories: inferPolicyCategoriesFromText(input.content),
        content: input.content,
        metadata: {
          conversationId: input.conversationId
        }
      }
    });

    const fallbackSearchReply = await this.buildFallbackSearchReply(
      input.actor,
      input.content,
      reply.content
    );
    const finalContent = fallbackSearchReply?.content ?? reply.content;
    const finalMetadata = {
      usage: reply.usage,
      retrieval: prompt.retrieval,
      ...(fallbackSearchReply?.metadata ?? {})
    };

    const assistantMessage = await this.messages.create({
      workspaceId: input.actor.workspaceId,
      conversationId: input.conversationId,
      role: "assistant",
      content: finalContent,
      metadata: finalMetadata
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

    const directSearchReply = await this.buildDirectSearchReply(
      input.actor,
      input.content
    );
    if (directSearchReply) {
      yield {
        type: "token" as const,
        chunk: {
          delta: directSearchReply.content,
          done: true
        }
      };

      await this.messages.create({
        workspaceId: input.actor.workspaceId,
        conversationId: input.conversationId,
        role: "assistant",
        content: directSearchReply.content,
        metadata: directSearchReply.metadata
      });
      await this.conversations.touch(input.conversationId);
      return;
    }

    if (this.shouldAttemptSearchFallback(input.content)) {
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

      const reply = await this.llm.createReply({
        provider: input.provider,
        model: input.model,
        messages: prompt.messages,
        policy: {
          actor: input.actor,
          action: "chat.stream_message",
          categories: inferPolicyCategoriesFromText(input.content),
          content: input.content,
          metadata: {
            conversationId: input.conversationId
          }
        }
      });

      const fallbackSearchReply = await this.buildFallbackSearchReply(
        input.actor,
        input.content,
        reply.content
      );
      const finalContent = fallbackSearchReply?.content ?? reply.content;

      yield {
        type: "token" as const,
        chunk: {
          delta: finalContent,
          done: true,
          usage: {
            inputTokens: reply.usage.inputTokens,
            outputTokens: reply.usage.outputTokens
          }
        }
      };

      await this.messages.create({
        workspaceId: input.actor.workspaceId,
        conversationId: input.conversationId,
        role: "assistant",
        content: finalContent,
        metadata: {
          usage: reply.usage,
          retrieval: prompt.retrieval,
          ...(fallbackSearchReply?.metadata ?? {})
        }
      });
      await this.conversations.touch(input.conversationId);
      return;
    }

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
      messages: prompt.messages,
      policy: {
        actor: input.actor,
        action: "chat.stream_message",
        categories: inferPolicyCategoriesFromText(input.content),
        content: input.content,
        metadata: {
          conversationId: input.conversationId
        }
      }
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
          "You are Security AI Lab, a self-hosted workspace assistant. Answer the user's request directly and naturally, and do not impose extra restrictions beyond the workspace configuration, user permissions, tool constraints, and model/provider limitations. Respond in the same language as the latest user message unless they explicitly ask for another language."
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

  private async buildDirectSearchReply(
    actor: AccessContext,
    input: string
  ): Promise<DirectSearchReply | null> {
    if (!this.shouldUseDirectSearch(input) || !(await this.hasPermission(actor, "tools"))) {
      return null;
    }

    return this.executeSearchReply(actor, input, "direct_search_query");
  }

  private async buildFallbackSearchReply(
    actor: AccessContext,
    input: string,
    modelReply: string
  ): Promise<DirectSearchReply | null> {
    if (!this.isProviderRefusal(modelReply)) {
      return null;
    }

    if (!this.shouldAttemptSearchFallback(input) || !(await this.hasPermission(actor, "tools"))) {
      return null;
    }

    return this.executeSearchReply(actor, input, "search_fallback_after_refusal");
  }

  private async executeSearchReply(
    actor: AccessContext,
    query: string,
    action: string
  ): Promise<DirectSearchReply | null> {
    try {
      const response = await this.tools.execute(
        "web-search",
        {
          query,
          maxResults: 5
        },
        {
          actor,
          resource: `chat.search.${action}`,
          action,
          reason: "Search fallback requires 'tools' permission",
          metadata: {
            conversationInput: true,
            fallback: true
          }
        }
      );

      const results = (response as {
        provider?: string;
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          excerpt?: string;
        }>;
      }).results ?? [];

      if (results.length === 0) {
        return null;
      }

      return {
        content: this.formatSearchResults(query, results),
        metadata: {
          searchProvider: (response as { provider?: string }).provider ?? "unknown",
          searchQuery: query
        }
      };
    } catch {
      return null;
    }
  }

  private formatSearchResults(
    query: string,
    results: Array<{
      title?: string;
      url?: string;
      description?: string;
      excerpt?: string;
    }>
  ): string {
    const lines = [`Search results for "${query}":`, ""];

    for (const [index, result] of results.slice(0, 5).entries()) {
      lines.push(`${index + 1}. ${result.title ?? "Untitled result"}`);
      if (result.url) {
        lines.push(`URL: ${result.url}`);
      }

      const snippet = result.description ?? result.excerpt ?? "";
      if (snippet) {
        lines.push(`Snippet: ${snippet}`);
      }

      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private shouldUseDirectSearch(input: string): boolean {
    const normalized = input.trim();
    if (!normalized || normalized.length > 160 || normalized.includes("\n")) {
      return false;
    }

    if (this.extractUrls(normalized).length > 0) {
      return false;
    }

    const lowered = normalized.toLowerCase();
    if (/\b(search|find|lookup|look up|google|bing|duckduckgo|show me|give me|list)\b/.test(lowered)) {
      return true;
    }

    const words = lowered.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 6) {
      return false;
    }

    if (/[?!.,;:]/.test(lowered)) {
      return false;
    }

    if (/^(what|why|how|when|where|who)\b/.test(lowered)) {
      return false;
    }

    if (/\b(write|generate|create|implement|refactor|debug|fix|review|summarize|explain|analy[sz]e|compare|translate|draft|code|script|function|class|query|sql|regex|algorithm)\b/.test(lowered)) {
      return false;
    }

    return true;
  }

  private shouldAttemptSearchFallback(input: string): boolean {
    const normalized = input.trim();
    if (!normalized || normalized.length > 220 || normalized.includes("\n")) {
      return false;
    }

    if (this.extractUrls(normalized).length > 0) {
      return false;
    }

    return (
      this.shouldUseDirectSearch(normalized) ||
      /\b(search|find|lookup|look up|google|bing|duckduckgo|show me|give me|list|where can i|where to)\b/i.test(normalized) ||
      /^(what|which|where|who)\b/i.test(normalized)
    );
  }

  private isProviderRefusal(reply: string): boolean {
    const normalized = reply.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return [
      "i'm sorry, but i can't assist with that request",
      "i'm sorry, but i can't assist with that",
      "i can't assist with that request",
      "i can't assist with that",
      "i'm here to answer questions and provide information, but i can't produce or engage with adult content",
      "i can't produce or engage with adult content"
    ].some((pattern) => normalized.includes(pattern));
  }
}
