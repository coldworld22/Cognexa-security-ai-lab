export const ACCESS_TOKEN_COOKIE_NAME = "security-ai-lab.access-token";
export const REFRESH_TOKEN_COOKIE_NAME = "security-ai-lab.refresh-token";
export const SESSION_PERSISTENCE_COOKIE_NAME = "security-ai-lab.session-persistence";
export const PERSISTED_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPersistence = "local" | "session";

function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === "production" || process.env.LOCAL_HTTPS === "true";
}

export function normalizeSessionPersistence(
  value?: string | null
): SessionPersistence {
  return value === "session" ? "session" : "local";
}

export function getAuthCookieOptions(persistence: SessionPersistence) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/",
    ...(persistence === "local"
      ? {
          maxAge: PERSISTED_AUTH_COOKIE_MAX_AGE_SECONDS
        }
      : {})
  };
}

export function getClearedAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0
  };
}
