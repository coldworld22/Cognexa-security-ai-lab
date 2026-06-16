import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { AgentExecutor } from "../src/agent/execution/agent-executor";

test("AgentExecutor injects retrieved context into planning and synthesis prompts", async () => {
  const structuredCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const replyCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const progressSnapshots: Array<Record<string, unknown>> = [];

  const executor = new AgentExecutor(
    {
      createStructuredOutput: async (_providerId, request) => {
        structuredCalls.push({
          messages: request.messages
        });
        return {
          action: "analysis",
          reasoning: "Retrieved documents cover the needed background."
        };
      },
      createReply: async (input) => {
        replyCalls.push({
          messages: input.messages
        });
        return {
          content: "Final grounded summary",
          usage: {
            inputTokens: 32,
            outputTokens: 11
          }
        };
      }
    } as never,
    {
      listTools: async () => [
        {
          name: "file-search",
          description: "Search files",
          category: "filesystem",
          inputSchema: {}
        }
      ],
      executeWithRecord: async () => {
        throw new Error("tool execution should not run for analysis-only plan");
      }
    } as never,
    {
      buildPromptContext: async () => ({
        contextMessage: "AGENT RAG CONTEXT",
        metadata: {
          query: "Investigate the uploaded incident report",
          sources: [
            {
              embeddingId: "embedding-1",
              fileId: "file-1",
              fileName: "incident-report.pdf",
              chunkIndex: 9,
              chunkReference: "incident-report.pdf#chunk-9",
              score: 0.94
            }
          ],
          maxChunks: 5,
          similarityThreshold: 0.2,
          maxContextTokens: 1200,
          usedContextTokens: 55
        }
      })
    } as never
  );

  const result = await executor.execute({
    actor: {
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
      permissions: ["agents", "tools", "rag"]
    } satisfies AccessContext,
    agent: {
      id: "agent-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      name: "Investigator",
      description: "Investigates incidents",
      instructions: "Summarize the findings for the analyst.",
      enabledTools: ["file-search"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    objective: "Investigate the uploaded incident report",
    taskId: "task-1",
    plan: [
      {
        id: "step-1",
        title: "Review the evidence",
        rationale: "Need to understand the uploaded report first."
      }
    ],
    onProgress: async (metadata) => {
      progressSnapshots.push(metadata);
    }
  });

  assert.ok(
    structuredCalls[0]?.messages.some((message) => message.content === "AGENT RAG CONTEXT")
  );
  assert.ok(
    replyCalls[0]?.messages.some((message) => message.content === "AGENT RAG CONTEXT")
  );
  assert.equal(result.retrieval?.sources[0]?.fileName, "incident-report.pdf");

  const firstSnapshot = progressSnapshots[0] as {
    retrieval?: {
      sources?: Array<{ chunkReference: string }>;
    };
  };
  assert.equal(
    firstSnapshot.retrieval?.sources?.[0]?.chunkReference,
    "incident-report.pdf#chunk-9"
  );
});
