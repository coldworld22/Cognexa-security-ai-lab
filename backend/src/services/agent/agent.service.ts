import { AgentRepository } from "../../database/repositories/agent.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { AgentExecutor } from "../../agent/execution/agent-executor";
import { TaskPlanner } from "../../agent/planner/task-planner";

interface ExecuteAgentInput {
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
  objective: string;
  conversationId?: string;
}

export class AgentService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly tasks: TaskRepository,
    private readonly planner: TaskPlanner,
    private readonly executor: AgentExecutor
  ) {}

  async execute(input: ExecuteAgentInput) {
    const agent = await this.agents.create({
      userId: input.userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      enabledTools: input.enabledTools
    });

    const plan = this.planner.createPlan(input.objective);
    const task = await this.tasks.create({
      agentId: agent.id,
      conversationId: input.conversationId,
      title: input.name,
      objective: input.objective,
      status: "running"
    });

    const result = await this.executor.execute({
      agent,
      taskId: task.id,
      plan
    });

    await this.tasks.updateResult(task.id, "completed", result.summary);

    return {
      agent,
      taskId: task.id,
      plan,
      result
    };
  }
}
