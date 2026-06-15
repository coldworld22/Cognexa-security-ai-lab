import { Request, Response } from "express";

import { AgentService } from "../../services/agent/agent.service";

export class AgentController {
  constructor(private readonly agents: AgentService) {}

  execute = async (request: Request, response: Response) => {
    const result = await this.agents.execute({
      userId: request.auth!.userId,
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
