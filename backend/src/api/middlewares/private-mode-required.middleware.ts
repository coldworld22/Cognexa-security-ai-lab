import { NextFunction, Request, Response } from "express";

import { CloakingService } from "../../services/private-mode/cloaking.service";

const PRIVATE_MODE_ACTIVATION_PATH = "/admin/private-mode";
const PRIVATE_MODE_BLOCKED_PATH = "/private-mode-required";

function isExemptPath(pathname: string): boolean {
  return (
    pathname === "/auth/session" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === PRIVATE_MODE_ACTIVATION_PATH ||
    pathname.startsWith(`${PRIVATE_MODE_ACTIVATION_PATH}/`)
  );
}

export function createPrivateModeRequiredMiddleware(
  privateMode: CloakingService
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth || isExemptPath(request.path)) {
      next();
      return;
    }

    try {
      const activeSession = await privateMode.getActiveSession(request.auth.workspaceId);
      if (activeSession) {
        next();
        return;
      }
    } catch (error) {
      next(error);
      return;
    }

    const canActivatePrivateMode =
      request.auth.permissions?.includes("admin_dashboard") ?? false;

    response.status(403).json({
      error: canActivatePrivateMode
        ? "Private Mode must be activated before using this workspace."
        : "This workspace is locked until an administrator activates Private Mode.",
      privateModeRequired: true,
      canActivatePrivateMode,
      redirectPath: canActivatePrivateMode
        ? PRIVATE_MODE_ACTIVATION_PATH
        : PRIVATE_MODE_BLOCKED_PATH
    });
  };
}
