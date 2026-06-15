import { NextFunction, Request, Response } from "express";

import { AuthService } from "../../services/auth/auth.service";

export function authMiddleware(authService: AuthService) {
  return (request: Request, response: Response, next: NextFunction) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      response.status(401).json({ error: "Missing bearer token" });
      return;
    }

    try {
      const token = header.replace("Bearer ", "");
      const payload = authService.verifyAccessToken(token);
      request.auth = {
        userId: payload.sub as string,
        email: payload.email as string
      };
      next();
    } catch {
      response.status(401).json({ error: "Invalid access token" });
    }
  };
}
