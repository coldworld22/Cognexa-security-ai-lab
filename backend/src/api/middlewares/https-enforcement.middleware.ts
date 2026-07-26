import { NextFunction, Request, Response } from "express";

interface HttpsEnforcementOptions {
  forceHttps: boolean;
  httpsPort?: number | null;
}

export function buildHttpsRedirectUrl(
  request: Pick<Request, "headers" | "originalUrl">,
  httpsPort?: number | null
): string {
  const hostHeader = request.headers.host?.trim() || "localhost";
  const targetUrl = new URL(request.originalUrl || "/", `http://${hostHeader}`);

  targetUrl.protocol = "https:";
  targetUrl.port = !httpsPort || httpsPort === 443 ? "" : String(httpsPort);

  return targetUrl.toString();
}

export function createHttpsEnforcementMiddleware(
  options: HttpsEnforcementOptions
) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!options.forceHttps || request.secure) {
      next();
      return;
    }

    response.redirect(308, buildHttpsRedirectUrl(request, options.httpsPort));
  };
}
