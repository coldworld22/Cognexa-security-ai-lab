import { Request, Response } from "express";

import { AdminService } from "../../services/admin/admin.service";
import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly tools: ToolExecutionService
  ) {}

  dashboard = async (_request: Request, response: Response) => {
    const dashboard = await this.admin.getDashboard();
    response.json({
      ...dashboard,
      availableTools: this.tools.listTools()
    });
  };
}
