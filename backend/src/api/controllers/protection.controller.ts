import { Request, Response } from "express";

import { SystemProtectionService } from "../../services/system-protection/system-protection.service";

export class ProtectionController {
  constructor(private readonly protection: SystemProtectionService) {}

  activate = async (request: Request, response: Response) => {
    const status = await this.protection.activateProtection({
      workspaceId: request.auth!.workspaceId,
      ...request.body
    });

    response.status(201).json({ status });
  };

  deactivate = async (request: Request, response: Response) => {
    const status = await this.protection.deactivateProtection(
      request.auth!.workspaceId
    );

    response.json({ status });
  };

  status = async (request: Request, response: Response) => {
    const status = await this.protection.getProtectionStatus(
      request.auth!.workspaceId
    );

    response.json({ status });
  };
}
