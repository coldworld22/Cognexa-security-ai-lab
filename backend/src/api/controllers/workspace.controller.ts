import { Request, Response } from "express";

import { AuthorizationService } from "../../services/authorization/authorization.service";
import { WorkspaceService } from "../../services/workspace/workspace.service";

export class WorkspaceController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly authorization: AuthorizationService
  ) {}

  listSession = async (request: Request, response: Response) => {
    const result = await this.workspaces.listSession(request.auth!.userId);
    response.json(result);
  };

  createWorkspace = async (request: Request, response: Response) => {
    const result = await this.workspaces.createWorkspace(request.auth!, {
      name: request.body.name as string,
      organizationName: request.body.organizationName as string | undefined
    });

    await this.authorization.invalidateUserCaches(
      request.auth!.userId,
      [request.auth!.role],
      [request.auth!.workspaceId, result.currentWorkspace.id]
    );

    response.status(201).json(result);
  };

  switchWorkspace = async (request: Request, response: Response) => {
    const result = await this.workspaces.switchWorkspace(
      request.auth!.userId,
      request.body.workspaceId as string
    );

    await this.authorization.invalidateUserCaches(
      request.auth!.userId,
      [request.auth!.role],
      [request.auth!.workspaceId, result.currentWorkspace.id]
    );

    response.json(result);
  };

  inviteMember = async (request: Request, response: Response) => {
    const invitation = await this.workspaces.createInvitation(request.auth!, {
      email: request.body.email as string,
      role: request.body.role as "owner" | "admin" | "member" | "viewer"
    });

    response.status(201).json({ invitation });
  };

  acceptInvitation = async (request: Request, response: Response) => {
    const result = await this.workspaces.acceptInvitation(
      request.auth!,
      request.params.invitationId as string
    );

    await this.authorization.invalidateUserCaches(
      request.auth!.userId,
      [request.auth!.role],
      [request.auth!.workspaceId, result.currentWorkspace.id]
    );

    response.json(result);
  };
}
