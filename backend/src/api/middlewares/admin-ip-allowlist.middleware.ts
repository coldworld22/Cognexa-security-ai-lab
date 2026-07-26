import { NextFunction, Request, Response } from "express";
import { isIP } from "net";

function normalizeIpLiteral(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const withoutZone =
    trimmed.includes("%") ? trimmed.slice(0, trimmed.indexOf("%")) : trimmed;
  const mappedIpv4 = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mappedIpv4?.[1] && isIP(mappedIpv4[1]) === 4) {
    return mappedIpv4[1];
  }

  return withoutZone;
}

function collectClientIpCandidates(request: Request): string[] {
  const candidates = [
    request.ip,
    request.socket.remoteAddress
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return Array.from(new Set(candidates.map(normalizeIpLiteral)));
}

export function createAdminIpAllowlistMiddleware(allowedIps: string[]) {
  const allowedIpSet = new Set(allowedIps.map(normalizeIpLiteral));

  return (request: Request, response: Response, next: NextFunction) => {
    if (allowedIpSet.size === 0) {
      next();
      return;
    }

    const clientIps = collectClientIpCandidates(request);
    const allowed = clientIps.some((ip) => allowedIpSet.has(ip));

    if (allowed) {
      next();
      return;
    }

    response.status(403).json({
      error: "Access denied"
    });
  };
}

export const adminIpAllowlistInternals = {
  collectClientIpCandidates,
  normalizeIpLiteral
};
