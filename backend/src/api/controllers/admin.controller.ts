import { Request, Response } from "express";

import { CanonicalUserRole } from "../../authorization/authorization.types";
import { AdminService } from "../../services/admin/admin.service";
import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly tools: ToolExecutionService
  ) {}

  dashboard = async (request: Request, response: Response) => {
    const dashboard = await this.admin.getDashboard(request.auth!);
    response.json({
      ...dashboard,
      availableTools: await this.tools.listTools(request.auth!)
    });
  };

  listUsers = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const users = await this.admin.listUsers(request.auth!, limit);
    response.json({ users });
  };

  updateUserRole = async (request: Request, response: Response) => {
    const user = await this.admin.updateUserRole(
      request.auth!,
      request.params.userId as string,
      request.body.role as CanonicalUserRole
    );
    response.json({ user });
  };
}
