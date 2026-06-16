import { AccessContext } from "../../authorization/authorization.types";
import { ToolExecutionRepository } from "../../database/repositories/tool-execution.repository";
import { ToolExecutionEntity } from "../../database/entities/tool-execution.entity";
import { AppError } from "../../utils/app-error";
import { ToolRegistry } from "../../tools/registry/tool-registry";
import { AuthorizationService } from "../authorization/authorization.service";

interface ToolExecutionRequestContext {
  actor: AccessContext;
  taskId?: string;
  resource?: string;
  action?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class ToolExecutionService {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly toolExecutions: ToolExecutionRepository,
    private readonly authorization: AuthorizationService
  ) {}

  async listTools(actor: AccessContext) {
    await this.authorization.assertPermission(actor, "tools", {
      layer: "service",
      resource: "tools.catalog",
      action: "list_tools",
      reason: "Tool catalog requires 'tools' permission"
    });

    return this.registry.list();
  }

  async listByTaskId(taskId: string, actor: AccessContext) {
    await this.authorization.assertPermission(actor, "agents", {
      layer: "service",
      resource: `agents.tasks.${taskId}.tool_executions`,
      action: "list_task_tool_executions",
      reason: "Agent task tool history requires 'agents' permission"
    });

    return this.toolExecutions.findByTaskId(taskId);
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionRequestContext
  ): Promise<unknown> {
    const result = await this.executeWithRecord(toolName, input, context);
    return result.output;
  }

  async executeWithRecord(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionRequestContext
  ): Promise<{
    execution: ToolExecutionEntity;
    output: unknown;
  }> {
    await this.authorization.assertPermission(context.actor, "tools", {
      layer: "tool",
      resource: context.resource ?? `tools.${toolName}`,
      action: context.action ?? "execute_tool",
      reason: context.reason ?? `Tool '${toolName}' requires 'tools' permission`,
      metadata: {
        toolName,
        ...(context.metadata ?? {})
      }
    });

    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new AppError(`Unknown tool: ${toolName}`, 404);
    }

    const execution = await this.toolExecutions.create({
      workspaceId: context.actor.workspaceId,
      taskId: context.taskId,
      toolName,
      inputPayload: input,
      outputPayload: {},
      status: "started"
    });

    try {
      const output = await tool.execute(input);
      await this.toolExecutions.update(execution.id, {
        outputPayload: output as Record<string, unknown>,
        status: "completed"
      });
      return {
        execution: {
          ...execution,
          outputPayload: output as Record<string, unknown>,
          status: "completed",
          updatedAt: new Date().toISOString()
        },
        output
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      await this.toolExecutions.update(execution.id, {
        outputPayload: {},
        status: "failed",
        errorMessage: message
      });
      throw error;
    }
  }
}
