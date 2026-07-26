import { Request, Response } from "express";

import { AuthService } from "../../services/auth/auth.service";
import { CloakingService } from "../../services/private-mode/cloaking.service";

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly privateMode: CloakingService
  ) {}

  register = async (_request: Request, response: Response) => {
    const result = await this.auth.register();
    response.status(403).json(result);
  };

  login = async (request: Request, response: Response) => {
    const result = await this.auth.login(request.body);
    response.json(result);
  };

  refresh = async (request: Request, response: Response) => {
    const result = await this.auth.refresh(request.body.refreshToken as string);
    response.json(result);
  };

  session = async (request: Request, response: Response) => {
    const activeSession = request.auth
      ? await this.privateMode.getActiveSession(request.auth.workspaceId)
      : null;
    const canActivatePrivateMode =
      request.auth?.permissions?.includes("admin_dashboard") ?? false;

    response.json({
      actor: request.auth,
      permissions: request.auth?.permissions ?? [],
      privateMode: {
        active: Boolean(activeSession),
        canActivate: canActivatePrivateMode,
        activationPath: "/admin/private-mode",
        blockedPath: "/private-mode-required"
      }
    });
  };

  updatePreferences = async (request: Request, response: Response) => {
    const user = await this.auth.updatePreferences(
      request.auth!.userId,
      request.body.preferences as Record<string, unknown>
    );
    response.json({ user });
  };
}
