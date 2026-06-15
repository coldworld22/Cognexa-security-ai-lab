import { Request, Response } from "express";

import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

export class ToolController {
  constructor(private readonly tools: ToolExecutionService) {}

  list = async (_request: Request, response: Response) => {
    response.json({
      tools: this.tools.listTools()
    });
  };
}
