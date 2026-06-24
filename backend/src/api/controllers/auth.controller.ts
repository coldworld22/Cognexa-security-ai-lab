import { Request, Response } from "express";

import { AuthService } from "../../services/auth/auth.service";

export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
    response.json({
      actor: request.auth,
      permissions: request.auth?.permissions ?? []
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
