import { NextFunction, Request, Response } from "express";

import { Permission } from "../../authorization/authorization.types";
import { AuthorizationService } from "../../services/authorization/authorization.service";

interface AuthorizeOptions {
  resource?: string | ((request: Request) => string);
  action?: string | ((request: Request) => string);
  metadata?: (request: Request) => Record<string, unknown>;
}

export function authorize(
  authorization: AuthorizationService,
  permission: Permission,
  options: AuthorizeOptions = {}
) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const actor = request.auth;
      if (!actor) {
        throw new Error("Authentication context missing");
      }

      await authorization.assertPermission(actor, permission, {
        layer: "route",
        resource:
          typeof options.resource === "function"
            ? options.resource(request)
            : options.resource ?? request.route?.path ?? request.path,
        action:
          typeof options.action === "function"
            ? options.action(request)
            : options.action ?? `${request.method} ${request.originalUrl}`,
        reason: `Route requires '${permission}' permission`,
        metadata: {
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          ...(options.metadata ? options.metadata(request) : {})
        }
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
