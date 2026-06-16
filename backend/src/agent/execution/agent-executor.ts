import { z } from "zod";

import { env } from "../../config/env";
import { AccessContext } from "../../authorization/authorization.types";
import { AgentEntity } from "../../database/entities/agent.entity";
import { TaskMetadata, TaskStepTrace } from "../../database/entities/task.entity";
import { ToolMetadata } from "../../tools/base-tool";
import { LLMService } from "../../services/llm/llm.service";
import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";
import { RetrievalContextService } from "../../services/rag/retrieval-context.service";
import {
  RetrievalContextMetadata,
  RetrievalPromptContext
} from "../../rag/retrieval/retrieval-context.types";

export interface ExecuteAgentPlanInput {
  actor: AccessContext;
  agent: AgentEntity;
  objective: string;
  taskId: string;
  plan: Array<{
    id: string;
    title: string;
    rationale: string;
  }>;
  metadata?: TaskMetadata;
  onProgress?: (metadata: TaskMetadata) => Promise<void>;
}

export interface AgentExecutionResult {
  summary: string;
  executedTools: string[];
  steps: TaskStepTrace[];
  reasoningLog: string[];
  retrieval?: RetrievalContextMetadata;
}

const toolDecisionSchema = z.object({
  action: z.enum(["tool", "analysis"]),
  reasoning: z.string().min(1),
  toolName: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional()
});

export class AgentExecutor {
  constructor(
    private readonly llm: LLMService,
    private readonly tools: ToolExecutionService,
    private readonly retrievalContext: RetrievalContextService
  ) {}

  async execute(input: ExecuteAgentPlanInput): Promise<AgentExecutionResult> {
    const availableTools = await this.getAvailableTools(
      input.actor,
      input.agent.enabledTools
    );
    const metadata = this.createInitialMetadata(input.plan, input.metadata);
    const retrieval = await this.resolveRetrievedContext(
      input.actor.workspaceId,
      input.objective
    );
    metadata.retrieval = retrieval.metadata;

    await input.onProgress?.(metadata);

    for (const step of metadata.steps) {
      if (step.status === "completed" || step.status === "skipped" || step.status === "failed") {
        continue;
      }

      if (step.status === "running") {
        step.status = "pending";
      }

      step.status = "running";
      step.startedAt = new Date().toISOString();
      await input.onProgress?.(this.snapshot(metadata));

      try {
        const decision = await this.decideNextAction({
          objective: input.objective,
          step,
          availableTools,
          metadata,
          retrieval
        });

        metadata.reasoningLog.push(`[${step.id}] ${decision.reasoning}`);
        step.note = decision.reasoning;

        if (decision.action === "tool") {
          const selectedTool = availableTools.find(
            (tool) => tool.name === decision.toolName
          );

          if (!selectedTool) {
            step.status = "skipped";
            step.finishedAt = new Date().toISOString();
            step.error = `Requested tool ${decision.toolName ?? "unknown"} is not available`;
            await input.onProgress?.(this.snapshot(metadata));
            continue;
          }

          const toolInput =
            decision.toolInput && Object.keys(decision.toolInput).length > 0
              ? decision.toolInput
              : this.buildFallbackToolInput(selectedTool.name, input.objective, step.title);

          if (!toolInput) {
            step.status = "skipped";
            step.finishedAt = new Date().toISOString();
            step.error = `No safe input could be derived for tool ${selectedTool.name}`;
            await input.onProgress?.(this.snapshot(metadata));
            continue;
          }

          const { execution, output } = await this.tools.executeWithRecord(
            selectedTool.name,
            toolInput,
            {
              actor: input.actor,
              taskId: input.taskId,
              resource: `agents.tasks.${input.taskId}.tools.${selectedTool.name}`,
              action: "execute_agent_tool",
              reason: `Agent tool '${selectedTool.name}' requires 'tools' permission`,
              metadata: {
                stepId: step.id
              }
            }
          );

          metadata.executedTools.push(selectedTool.name);
          step.toolName = selectedTool.name;
          step.toolInput = toolInput;
          step.toolExecutionId = execution.id;
          step.toolOutputPreview = this.createOutputPreview(output);
        }

        step.status = "completed";
        step.finishedAt = new Date().toISOString();
      } catch (error) {
        step.status = "failed";
        step.finishedAt = new Date().toISOString();
        step.error = error instanceof Error ? error.message : "Unknown step failure";
        metadata.reasoningLog.push(`[${step.id}] Failed: ${step.error}`);
      }

      await input.onProgress?.(this.snapshot(metadata));
    }

    const summary = await this.synthesizeResult(
      input.agent.instructions,
      input.objective,
      metadata,
      availableTools,
      retrieval
    );

    metadata.finalSummary = summary;
    metadata.lastUpdatedAt = new Date().toISOString();
    await input.onProgress?.(this.snapshot(metadata));

    return {
      summary,
      executedTools: metadata.executedTools,
      steps: metadata.steps,
      reasoningLog: metadata.reasoningLog,
      retrieval: metadata.retrieval
    };
  }

  private createInitialMetadata(
    plan: ExecuteAgentPlanInput["plan"],
    metadata?: TaskMetadata
  ): TaskMetadata {
    if (!metadata || metadata.steps.length === 0) {
      return {
        steps: plan.map((step) => ({
          id: step.id,
          title: step.title,
          rationale: step.rationale,
          status: "pending"
        })),
        executedTools: [],
        reasoningLog: []
      };
    }

    const plannedSteps = new Map(plan.map((step) => [step.id, step]));

    return {
      steps: metadata.steps.map((step) => {
        const plannedStep = plannedSteps.get(step.id);

        return {
          ...step,
          title: plannedStep?.title ?? step.title,
          rationale: plannedStep?.rationale ?? step.rationale
        };
      }),
      executedTools: [...metadata.executedTools],
      reasoningLog: [...metadata.reasoningLog],
      retrieval: metadata.retrieval,
      finalSummary: metadata.finalSummary,
      lastUpdatedAt: metadata.lastUpdatedAt
    };
  }

  private async getAvailableTools(
    actor: AccessContext,
    enabledTools: string[]
  ): Promise<ToolMetadata[]> {
    const allTools = await this.tools.listTools(actor);
    if (enabledTools.length === 0) {
      return allTools;
    }

    return allTools.filter((tool) => enabledTools.includes(tool.name));
  }

  private async decideNextAction(input: {
    objective: string;
    step: TaskStepTrace;
    availableTools: ToolMetadata[];
    metadata: TaskMetadata;
    retrieval: RetrievalPromptContext;
  }) {
    if (input.availableTools.length === 0) {
      return {
        action: "analysis" as const,
        reasoning: "No tools are enabled for this agent; proceeding with reasoning only."
      };
    }

    try {
      const decision = await this.llm.createStructuredOutput(
        env.DEFAULT_LLM_PROVIDER,
        {
          model: env.DEFAULT_LLM_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are an execution planner. Choose either one tool call or a pure analysis step. Return only JSON matching the requested schema."
            },
            ...this.buildRetrievalPromptMessages(input.retrieval),
            {
              role: "user",
              content: JSON.stringify({
                objective: input.objective,
                currentStep: {
                  id: input.step.id,
                  title: input.step.title,
                  rationale: input.step.rationale
                },
                priorExecution: {
                  executedTools: input.metadata.executedTools,
                  reasoningLog: input.metadata.reasoningLog.slice(-6),
                  completedSteps: input.metadata.steps
                    .filter((step) => step.status === "completed")
                    .map((step) => ({
                      id: step.id,
                      title: step.title,
                      toolName: step.toolName,
                      note: step.note,
                      toolOutputPreview: step.toolOutputPreview
                    }))
                },
                availableTools: input.availableTools
              })
            }
          ]
        },
        toolDecisionSchema
      );

      if (
        decision.action === "tool" &&
        decision.toolName &&
        input.availableTools.some((tool) => tool.name === decision.toolName)
      ) {
        return decision;
      }
    } catch {
      // Fall through to heuristics.
    }

    return this.buildFallbackDecision(
      input.objective,
      input.step.title,
      input.availableTools
    );
  }

  private buildFallbackDecision(
    objective: string,
    stepTitle: string,
    availableTools: ToolMetadata[]
  ) {
    const haystack = `${objective}\n${stepTitle}`.toLowerCase();
    const availableNames = new Set(availableTools.map((tool) => tool.name));

    const pick = (
      toolName: string,
      reasoning: string
    ):
      | {
          action: "tool";
          reasoning: string;
          toolName: string;
          toolInput?: Record<string, unknown>;
        }
      | undefined => {
      if (!availableNames.has(toolName)) {
        return undefined;
      }

      return {
        action: "tool",
        reasoning,
        toolName,
        toolInput: this.buildFallbackToolInput(toolName, objective, stepTitle) ?? undefined
      };
    };

    if (/\b(repo|repository|code|source)\b/.test(haystack)) {
      return (
        pick("repository-search", "The objective references source code or repository context.") ?? {
          action: "analysis" as const,
          reasoning: "Repository context was requested but repository-search is not enabled."
        }
      );
    }

    if (/\b(file|folder|directory)\b/.test(haystack)) {
      return (
        pick("file-search", "The objective references files or directories.") ?? {
          action: "analysis" as const,
          reasoning: "File context was requested but file-search is not enabled."
        }
      );
    }

    if (/\b(doc|docs|documentation|readme|guide)\b/.test(haystack)) {
      return (
        pick("documentation-search", "The objective references documentation.") ?? {
          action: "analysis" as const,
          reasoning: "Documentation context was requested but documentation-search is not enabled."
        }
      );
    }

    if (/\b(http|https|url|website|web)\b/.test(haystack)) {
      return (
        pick("web-search", "The objective references a website or external web context.") ?? {
          action: "analysis" as const,
          reasoning: "Web context was requested but web-search is not enabled."
        }
      );
    }

    if (this.extractSql(objective) && availableNames.has("database-query")) {
      return {
        action: "tool",
        reasoning: "A SQL query was detected in the objective.",
        toolName: "database-query",
        toolInput: {
          sql: this.extractSql(objective)!
        }
      };
    }

    if (this.extractExpression(objective) && availableNames.has("calculator")) {
      return {
        action: "tool",
        reasoning: "An arithmetic expression was detected in the objective.",
        toolName: "calculator",
        toolInput: {
          expression: this.extractExpression(objective)!
        }
      };
    }

    return {
      action: "analysis" as const,
      reasoning:
        "No specific tool was strongly indicated by the objective, so this step should remain analysis-only."
    };
  }

  private buildFallbackToolInput(
    toolName: string,
    objective: string,
    stepTitle: string
  ): Record<string, unknown> | null {
    const query = this.buildSearchQuery(objective, stepTitle);

    switch (toolName) {
      case "repository-search":
      case "documentation-search":
        return {
          query,
          maxResults: 5
        };
      case "file-search":
        return {
          query,
          maxResults: 5
        };
      case "web-search":
        return {
          query
        };
      case "calculator": {
        const expression = this.extractExpression(objective);
        return expression
          ? {
              expression
            }
          : null;
      }
      case "database-query": {
        const sql = this.extractSql(objective);
        return sql
          ? {
              sql
            }
          : null;
      }
      default:
        return null;
    }
  }

  private buildSearchQuery(objective: string, stepTitle: string): string {
    return `${stepTitle}: ${objective}`.slice(0, 240);
  }

  private extractSql(input: string): string | null {
    const match = input.match(/\b(select|with)\b[\s\S]*$/i);
    return match?.[0]?.trim() ?? null;
  }

  private extractExpression(input: string): string | null {
    const match = input.match(/[0-9+\-*/().\s]{3,}/);
    const expression = match?.[0]?.trim() ?? "";
    return expression && /[+\-*/]/.test(expression) ? expression : null;
  }

  private async synthesizeResult(
    instructions: string,
    objective: string,
    metadata: TaskMetadata,
    availableTools: ToolMetadata[],
    retrieval: RetrievalPromptContext
  ): Promise<string> {
    const response = await this.llm.createReply({
      provider: env.DEFAULT_LLM_PROVIDER,
      model: env.DEFAULT_LLM_MODEL,
      messages: [
        {
          role: "system",
          content: instructions
        },
        ...this.buildRetrievalPromptMessages(retrieval),
        {
          role: "user",
          content: JSON.stringify({
            objective,
            availableTools: availableTools.map((tool) => tool.name),
            executedTools: metadata.executedTools,
            steps: metadata.steps,
            reasoningLog: metadata.reasoningLog
          })
        }
      ]
    });

    return response.content;
  }

  private createOutputPreview(output: unknown): string {
    const serialized = JSON.stringify(output);
    return serialized.length > 1200
      ? `${serialized.slice(0, 1200)}...`
      : serialized;
  }

  private snapshot(metadata: TaskMetadata): TaskMetadata {
    return {
      steps: metadata.steps.map((step) => ({
        ...step,
        toolInput: step.toolInput ? { ...step.toolInput } : undefined
      })),
      executedTools: [...metadata.executedTools],
      reasoningLog: [...metadata.reasoningLog],
      retrieval: metadata.retrieval,
      finalSummary: metadata.finalSummary,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  private buildRetrievalPromptMessages(
    retrieval: RetrievalPromptContext
  ) {
    if (!retrieval.contextMessage) {
      return [];
    }

    return [
      {
        role: "system" as const,
        content: retrieval.contextMessage
      }
    ];
  }

  private async resolveRetrievedContext(workspaceId: string, objective: string) {
    try {
      return await this.retrievalContext.buildPromptContext({
        workspaceId,
        query: objective
      });
    } catch {
      return {
        metadata: {
          query: objective,
          sources: [],
          maxChunks: 0,
          similarityThreshold: 0,
          maxContextTokens: 0,
          usedContextTokens: 0
        }
      };
    }
  }
}
