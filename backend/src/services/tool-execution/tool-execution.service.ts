import { ToolExecutionRepository } from "../../database/repositories/tool-execution.repository";
import { AppError } from "../../utils/app-error";
import { ToolRegistry } from "../../tools/registry/tool-registry";

export class ToolExecutionService {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly toolExecutions: ToolExecutionRepository
  ) {}

  listTools() {
    return this.registry.list();
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    taskId?: string
  ): Promise<unknown> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new AppError(`Unknown tool: ${toolName}`, 404);
    }

    try {
      const output = await tool.execute(input);
      await this.toolExecutions.create({
        taskId,
        toolName,
        inputPayload: input,
        outputPayload: output as Record<string, unknown>,
        status: "completed"
      });
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      await this.toolExecutions.create({
        taskId,
        toolName,
        inputPayload: input,
        outputPayload: {},
        status: "failed",
        errorMessage: message
      });
      throw error;
    }
  }
}
