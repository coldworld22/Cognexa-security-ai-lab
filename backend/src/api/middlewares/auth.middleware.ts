import { NextFunction, Request, Response } from "express";

import { AuthService } from "../../services/auth/auth.service";
import { AuthorizationService } from "../../services/authorization/authorization.service";
import { AppError } from "../../utils/app-error";

export function authMiddleware(
  authService: AuthService,
  authorization: AuthorizationService
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      response.status(401).json({ error: "Missing bearer token" });
      return;
    }

    try {
      const token = header.replace("Bearer ", "");
      const payload = authService.verifyAccessToken(token);
      const requestedWorkspaceId = request.header("x-workspace-id")?.trim();
      const actor = await authorization.getUserAccessContext(
        payload.sub as string,
        payload.email as string,
        requestedWorkspaceId || undefined
      );
      request.auth = {
        ...actor,
        permissions: await authorization.getPermissionsForActor(actor)
      };
      next();
    } catch (error) {
      if (error instanceof AppError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

      response.status(401).json({ error: "Invalid access token" });
    }
  };
}
