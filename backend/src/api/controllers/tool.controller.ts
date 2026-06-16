import { Request, Response } from "express";

import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

export class ToolController {
  constructor(private readonly tools: ToolExecutionService) {}

  list = async (request: Request, response: Response) => {
    response.json({
      tools: await this.tools.listTools(request.auth!)
    });
  };
}
