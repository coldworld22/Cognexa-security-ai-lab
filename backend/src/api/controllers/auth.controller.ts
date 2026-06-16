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
}
