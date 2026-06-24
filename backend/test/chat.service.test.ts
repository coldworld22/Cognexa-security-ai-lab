import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { ChatService } from "../src/services/chat/chat.service";

function createConversation() {
  return {
    id: "conversation-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    title: "Test Conversation",
    modelProvider: "qwen",
    modelName: "qwen2.5-coder",
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createActor(
  permissions: AccessContext["permissions"] = ["chat", "memory", "rag"]
): AccessContext {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role: "developer",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions
  };
}

test("ChatService injects retrieved context and returns source attribution", async () => {
  const history: Array<Record<string, unknown>> = [];
  const llmCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  const chat = new ChatService(
    {
      listByWorkspace: async () => [],
      deleteById: async () => true,
      create: async () => createConversation(),
      findById: async () => createConversation(),
      touch: async () => undefined
    } as never,
    {
      create: async (input) => {
        const message = {
          id: `message-${history.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        history.push(message);
        return message;
      },
      listByConversation: async () => history as never
    } as never,
    {
      createReply: async (input) => {
        llmCalls.push({
          messages: input.messages
        });
        return {
          content: "Grounded answer",
          usage: {
            inputTokens: 21,
            outputTokens: 8
          }
        };
      }
    } as never,
    {
      assertPermission: async () => undefined,
      getPermissionsForActor: async (actor: AccessContext) => actor.permissions ?? []
    } as never,
    {
      getUserContext: async () => ({
        preferences: [],
        longTerm: [],
        shortTerm: []
      })
    } as never,
    {
      execute: async () => {
        throw new Error("website context should not be fetched in this test");
      }
    } as never,
    {
      buildPromptContext: async () => ({
        contextMessage: "RAG CONTEXT",
        metadata: {
          query: "What does the uploaded runbook say?",
          sources: [
            {
              embeddingId: "embedding-1",
              fileId: "file-1",
              fileName: "runbook.md",
              chunkIndex: 2,
              chunkReference: "runbook.md#chunk-2",
              score: 0.91
            }
          ],
          maxChunks: 5,
          similarityThreshold: 0.2,
          maxContextTokens: 1200,
          usedContextTokens: 40
        }
      })
    } as never
  );

  const result = await chat.postMessage({
    conversationId: "conversation-1",
    actor: createActor(),
    content: "What does the uploaded runbook say?",
    provider: "qwen",
    model: "qwen2.5-coder"
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.chunkReference, "runbook.md#chunk-2");
  assert.ok(llmCalls[0]?.messages.some((message) => message.content === "RAG CONTEXT"));

  const assistantMessage = history.at(-1) as {
    metadata?: {
      retrieval?: {
        sources?: Array<{ fileName: string; chunkReference: string }>;
      };
    };
  };
  assert.equal(
    assistantMessage.metadata?.retrieval?.sources?.[0]?.fileName,
    "runbook.md"
  );
});

test("ChatService falls back to the normal prompt flow when retrieval augmentation fails", async () => {
  const history: Array<Record<string, unknown>> = [];
  const llmCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  const chat = new ChatService(
    {
      listByWorkspace: async () => [],
      deleteById: async () => true,
      create: async () => createConversation(),
      findById: async () => createConversation(),
      touch: async () => undefined
    } as never,
    {
      create: async (input) => {
        const message = {
          id: `message-${history.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        history.push(message);
        return message;
      },
      listByConversation: async () => history as never
    } as never,
    {
      createReply: async (input) => {
        llmCalls.push({
          messages: input.messages
        });
        return {
          content: "Fallback answer",
          usage: {
            inputTokens: 10,
            outputTokens: 4
          }
        };
      }
    } as never,
    {
      assertPermission: async () => undefined,
      getPermissionsForActor: async (actor: AccessContext) => actor.permissions ?? []
    } as never,
    {
      getUserContext: async () => ({
        preferences: [],
        longTerm: [],
        shortTerm: []
      })
    } as never,
    {
      execute: async () => {
        throw new Error("website context should not be fetched in this test");
      }
    } as never,
    {
      buildPromptContext: async () => {
        throw new Error("retrieval unavailable");
      }
    } as never
  );

  const result = await chat.postMessage({
    conversationId: "conversation-1",
    actor: createActor(),
    content: "Just answer normally",
    provider: "qwen",
    model: "qwen2.5-coder"
  });

  assert.equal(result.sources.length, 0);
  assert.equal(llmCalls.length, 1);
  assert.ok(llmCalls[0]?.messages.every((message) => message.content !== "RAG CONTEXT"));
});

test("ChatService skips optional memory, rag, and tool augmentation when permissions are absent", async () => {
  const history: Array<Record<string, unknown>> = [];
  let memoryCalls = 0;
  let retrievalCalls = 0;
  let toolCalls = 0;

  const chat = new ChatService(
    {
      listByWorkspace: async () => [],
      deleteById: async () => true,
      create: async () => createConversation(),
      findById: async () => createConversation(),
      touch: async () => undefined
    } as never,
    {
      create: async (input) => {
        const message = {
          id: `message-${history.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        history.push(message);
        return message;
      },
      listByConversation: async () => history as never
    } as never,
    {
      createReply: async () => ({
        content: "Viewer-safe answer",
        usage: {
          inputTokens: 4,
          outputTokens: 2
        }
      })
    } as never,
    {
      assertPermission: async () => undefined,
      getPermissionsForActor: async (actor: AccessContext) => actor.permissions ?? []
    } as never,
    {
      getUserContext: async () => {
        memoryCalls += 1;
        return {
          preferences: [],
          longTerm: [],
          shortTerm: []
        };
      }
    } as never,
    {
      execute: async () => {
        toolCalls += 1;
        return {};
      }
    } as never,
    {
      buildPromptContext: async () => {
        retrievalCalls += 1;
        return {
          metadata: {
            query: "ignored",
            sources: [],
            maxChunks: 0,
            similarityThreshold: 0,
            maxContextTokens: 0,
            usedContextTokens: 0
          }
        };
      }
    } as never
  );

  const result = await chat.postMessage({
    conversationId: "conversation-1",
    actor: createActor(["chat"]),
    content: "Review https://example.com and answer from memory",
    provider: "qwen",
    model: "qwen2.5-coder"
  });

  assert.equal(result.sources.length, 0);
  assert.equal(memoryCalls, 0);
  assert.equal(retrievalCalls, 0);
  assert.equal(toolCalls, 0);
});

test("ChatService answers short keyword queries from web search without invoking the model", async () => {
  const history: Array<Record<string, unknown>> = [];
  let llmCalls = 0;
  let toolCalls = 0;

  const chat = new ChatService(
    {
      listByWorkspace: async () => [],
      deleteById: async () => true,
      create: async () => createConversation(),
      findById: async () => createConversation(),
      touch: async () => undefined
    } as never,
    {
      create: async (input) => {
        const message = {
          id: `message-${history.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        history.push(message);
        return message;
      },
      listByConversation: async () => history as never
    } as never,
    {
      createReply: async () => {
        llmCalls += 1;
        return {
          content: "This should not be used",
          usage: {
            inputTokens: 1,
            outputTokens: 1
          }
        };
      }
    } as never,
    {
      assertPermission: async () => undefined,
      getPermissionsForActor: async (actor: AccessContext) => actor.permissions ?? []
    } as never,
    {
      getUserContext: async () => ({
        preferences: [],
        longTerm: [],
        shortTerm: []
      })
    } as never,
    {
      execute: async () => {
        toolCalls += 1;
        return {
          provider: "bing-search",
          results: [
            {
              title: "Example Result",
              url: "https://example.com",
              description: "Example snippet"
            }
          ]
        };
      }
    } as never,
    {
      buildPromptContext: async () => null
    } as never
  );

  const result = await chat.postMessage({
    conversationId: "conversation-1",
    actor: createActor(["chat", "tools"]),
    content: "pornsties",
    provider: "qwen",
    model: "qwen2.5-coder"
  });

  assert.equal(llmCalls, 0);
  assert.equal(toolCalls, 1);
  assert.match(result.reply.content, /Search results for "pornsties"/);
  assert.match(result.reply.content, /https:\/\/example\.com/);
});

test("ChatService replaces provider refusals with search results for lookup-style prompts", async () => {
  const history: Array<Record<string, unknown>> = [];
  let llmCalls = 0;

  const chat = new ChatService(
    {
      listByWorkspace: async () => [],
      deleteById: async () => true,
      create: async () => createConversation(),
      findById: async () => createConversation(),
      touch: async () => undefined
    } as never,
    {
      create: async (input) => {
        const message = {
          id: `message-${history.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        history.push(message);
        return message;
      },
      listByConversation: async () => history as never
    } as never,
    {
      createReply: async () => {
        llmCalls += 1;
        return {
          content:
            "I'm sorry, but I can't assist with that request. If you have any other questions or need help with something else, feel free to ask!",
          usage: {
            inputTokens: 9,
            outputTokens: 7
          }
        };
      }
    } as never,
    {
      assertPermission: async () => undefined,
      getPermissionsForActor: async (actor: AccessContext) => actor.permissions ?? []
    } as never,
    {
      getUserContext: async () => ({
        preferences: [],
        longTerm: [],
        shortTerm: []
      })
    } as never,
    {
      execute: async () => ({
        provider: "bing-search",
        results: [
          {
            title: "Fallback Result",
            url: "https://example.org",
            description: "Fallback snippet"
          }
        ]
      })
    } as never,
    {
      buildPromptContext: async () => null
    } as never
  );

  const result = await chat.postMessage({
    conversationId: "conversation-1",
    actor: createActor(["chat", "tools"]),
    content: "what are some porn sites",
    provider: "qwen",
    model: "qwen2.5-coder"
  });

  assert.equal(llmCalls, 1);
  assert.doesNotMatch(result.reply.content, /can't assist/i);
  assert.match(result.reply.content, /Fallback Result/);
  assert.match(result.reply.content, /https:\/\/example\.org/);
});
