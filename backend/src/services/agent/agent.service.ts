import { Logger } from "pino";

import { AccessContext } from "../../authorization/authorization.types";
import { AgentRepository } from "../../database/repositories/agent.repository";
import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { AgentEntity } from "../../database/entities/agent.entity";
import { TaskEntity, TaskMetadata } from "../../database/entities/task.entity";
import { ToolExecutionEntity } from "../../database/entities/tool-execution.entity";
import { AgentExecutionResult, AgentExecutor } from "../../agent/execution/agent-executor";
import { TaskPlanner } from "../../agent/planner/task-planner";
import { AuthorizationService } from "../authorization/authorization.service";
import { ToolExecutionService } from "../tool-execution/tool-execution.service";
import { AppError } from "../../utils/app-error";

interface ExecuteAgentInput {
  actor: AccessContext;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
  objective: string;
  conversationId?: string;
}

export interface AgentTaskPlanStep {
  id: string;
  title: string;
  rationale: string;
}

export interface AgentTaskDetailResult {
  task: TaskEntity;
  toolExecutions: ToolExecutionEntity[];
}

export interface ExecuteAgentResponse extends AgentTaskDetailResult {
  agent: AgentEntity;
  plan: AgentTaskPlanStep[];
  result: AgentExecutionResult | null;
}

export class AgentService {
  private readonly concurrency = 2;
  private readonly activeTasks = new Set<string>();
  private readonly pendingTaskIds: string[] = [];

  constructor(
    private readonly agents: AgentRepository,
    private readonly conversations: ConversationRepository,
    private readonly tasks: TaskRepository,
    private readonly tools: ToolExecutionService,
    private readonly planner: TaskPlanner,
    private readonly executor: AgentExecutor,
    private readonly authorization: AuthorizationService,
    private readonly logger: Logger
  ) {}

  async initialize(): Promise<void> {
    const recoverableTasks = await this.tasks.listByStatuses(["queued", "running"], 100);
    for (const task of recoverableTasks) {
      this.enqueue(task.id);
    }
  }

  async listTasks(actor: AccessContext, limit = 20): Promise<TaskEntity[]> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: "agents.tasks",
      action: "list_agent_tasks",
      reason: "Agent task access requires 'agents' permission"
    });

    return this.tasks.listByWorkspaceId(actor.workspaceId, limit);
  }

  async getTask(actor: AccessContext, taskId: string): Promise<AgentTaskDetailResult> {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: `agents.tasks.${taskId}`,
      action: "get_agent_task",
      reason: "Agent task access requires 'agents' permission"
    });

    const task = await this.tasks.findByIdInWorkspace(taskId, actor.workspaceId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    const toolExecutions = await this.tools.listByTaskId(task.id, actor);

    return {
      task,
      toolExecutions
    };
  }

  async execute(input: ExecuteAgentInput): Promise<ExecuteAgentResponse> {
    await this.authorization.assertPermission(input.actor, "agents", {
      layer: "service",
      resource: "agents.execute",
      action: "execute_agent",
      reason: "Agent execution requires 'agents' permission"
    });

    if (input.conversationId) {
      const conversation = await this.conversations.findById(input.conversationId);
      if (!conversation || conversation.workspaceId !== input.actor.workspaceId) {
        throw new AppError("Conversation not found", 404);
      }
    }

    const agent = await this.agents.create({
      workspaceId: input.actor.workspaceId,
      userId: input.actor.userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      enabledTools: input.enabledTools
    });

    const plan = this.planner.createPlan(input.objective);
    const initialMetadata: TaskMetadata = {
      steps: plan.map((step) => ({
        id: step.id,
        title: step.title,
        rationale: step.rationale,
        status: "pending"
      })),
      executedTools: [],
      reasoningLog: []
    };

    const task = await this.tasks.create({
      workspaceId: input.actor.workspaceId,
      agentId: agent.id,
      conversationId: input.conversationId,
      title: input.name,
      objective: input.objective,
      status: "queued",
      metadata: initialMetadata
    });

    this.enqueue(task.id);

    return {
      agent,
      task,
      plan,
      result: null,
      toolExecutions: []
    };
  }

  private enqueue(taskId: string): void {
    if (this.activeTasks.has(taskId) || this.pendingTaskIds.includes(taskId)) {
      return;
    }

    this.pendingTaskIds.push(taskId);
    this.pumpQueue();
  }

  private pumpQueue(): void {
    while (
      this.activeTasks.size < this.concurrency &&
      this.pendingTaskIds.length > 0
    ) {
      const nextTaskId = this.pendingTaskIds.shift();
      if (!nextTaskId || this.activeTasks.has(nextTaskId)) {
        continue;
      }

      this.activeTasks.add(nextTaskId);
      void this.processTask(nextTaskId)
        .catch((error) => {
          this.logger.error({ error, taskId: nextTaskId }, "Agent task processing failed");
        })
        .finally(() => {
          this.activeTasks.delete(nextTaskId);
          this.pumpQueue();
        });
    }
  }

  private async processTask(taskId: string): Promise<void> {
    const task = await this.tasks.findById(taskId);
    if (!task || task.status === "completed" || task.status === "failed") {
      return;
    }

    const agent = await this.agents.findById(task.agentId);
    if (!agent) {
      const message = "Agent definition not found for queued task";
      await this.tasks.updateResult(task.id, "failed", message, {
        ...task.metadata,
        reasoningLog: [...task.metadata.reasoningLog, message],
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const plan =
      task.metadata.steps.length > 0
        ? task.metadata.steps.map((step) => ({
            id: step.id,
            title: step.title,
            rationale: step.rationale
          }))
        : this.planner.createPlan(task.objective);

    let latestMetadata: TaskMetadata = {
      steps: task.metadata.steps.map((step) => ({ ...step })),
      executedTools: [...task.metadata.executedTools],
      reasoningLog: [...task.metadata.reasoningLog],
      retrieval: task.metadata.retrieval,
      finalSummary: task.metadata.finalSummary,
      lastUpdatedAt: task.metadata.lastUpdatedAt
    };

    try {
      const actor = await this.authorization.getUserAccessContext(
        agent.userId,
        undefined,
        agent.workspaceId
      );
      await this.authorization.assertPermission(actor, "agents", {
        layer: "service",
        resource: `agents.tasks.${task.id}`,
        action: "resume_agent_task",
        reason: "Queued agent execution requires 'agents' permission"
      });
      const result = await this.executor.execute({
        actor,
        agent,
        objective: task.objective,
        taskId: task.id,
        plan,
        metadata: latestMetadata,
        onProgress: async (metadata) => {
          latestMetadata = metadata;
          await this.tasks.updateState(task.id, {
            status: "running",
            metadata
          });
        }
      });

      const finalMetadata: TaskMetadata = {
        steps: result.steps,
        executedTools: result.executedTools,
        reasoningLog: result.reasoningLog,
        retrieval: result.retrieval,
        finalSummary: result.summary,
        lastUpdatedAt: new Date().toISOString()
      };

      await this.tasks.updateResult(
        task.id,
        "completed",
        result.summary,
        finalMetadata
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Agent execution failed unexpectedly";

      await this.tasks.updateResult(task.id, "failed", message, {
        ...latestMetadata,
        reasoningLog: [...latestMetadata.reasoningLog, message],
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }
}
