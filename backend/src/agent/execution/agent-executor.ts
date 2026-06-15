import { AgentEntity } from "../../database/entities/agent.entity";
import { LLMService } from "../../services/llm/llm.service";
import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

interface ExecuteAgentPlanInput {
  agent: AgentEntity;
  taskId: string;
  plan: Array<{
    id: string;
    title: string;
    rationale: string;
  }>;
}

export class AgentExecutor {
  constructor(
    private readonly llm: LLMService,
    private readonly tools: ToolExecutionService
  ) {}

  async execute(input: ExecuteAgentPlanInput) {
    const availableTools = this.tools.listTools().map((tool) => tool.name);
    const summary = await this.llm.createReply({
      provider: "qwen",
      model: "qwen2.5-coder",
      messages: [
        {
          role: "system",
          content: input.agent.instructions
        },
        {
          role: "user",
          content: `Execute this objective with tools ${availableTools.join(", ")} and plan ${JSON.stringify(input.plan)}`
        }
      ]
    });

    return {
      summary: summary.content,
      executedTools: availableTools.slice(0, 3)
    };
  }
}
