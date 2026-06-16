import { Request, Response } from "express";

import { AgentService } from "../../services/agent/agent.service";

export class AgentController {
  constructor(private readonly agents: AgentService) {}

  listTasks = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit: number };
    const tasks = await this.agents.listTasks(
      request.auth!,
      limit
    );

    response.json({ tasks });
  };

  getTask = async (request: Request, response: Response) => {
    const result = await this.agents.getTask(
      request.auth!,
      request.params.taskId as string
    );

    response.json(result);
  };

  execute = async (request: Request, response: Response) => {
    const result = await this.agents.execute({
      actor: request.auth!,
      name: request.body.name as string,
      description: request.body.description as string,
      instructions: request.body.instructions as string,
      enabledTools: request.body.enabledTools as string[],
      objective: request.body.objective as string,
      conversationId: request.body.conversationId as string | undefined
    });

    response.status(202).json(result);
  };
}
