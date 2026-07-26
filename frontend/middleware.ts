import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  SESSION_PERSISTENCE_COOKIE_NAME,
  getClearedAuthCookieOptions
} from "@/lib/auth-cookies";
import { verifyAccessToken } from "@/lib/auth-token";

const JWT_SECRET = process.env.JWT_SECRET ?? "";
const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const ENFORCE_HTTPS =
  process.env.ENFORCE_HTTPS === "true" || process.env.LOCAL_HTTPS === "true";

interface AuthSessionPayload {
  permissions: string[];
  privateMode?: {
    active?: boolean;
    canActivate?: boolean;
    activationPath?: string;
    blockedPath?: string;
  };
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isPrivateModeActivationPath(pathname: string): boolean {
  return pathname === "/admin/private-mode" || pathname.startsWith("/admin/private-mode/");
}

function isPrivateModeBlockedPath(pathname: string): boolean {
  return pathname === "/private-mode-required";
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/health" ||
    pathname === "/api/session"
  );
}

function requestProtocol(request: NextRequest): "http" | "https" {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();

  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol;
  }

  return request.nextUrl.protocol === "https:" ? "https" : "http";
}

function clearAuthCookies(response: NextResponse) {
  const cookieOptions = getClearedAuthCookieOptions();

  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, "", cookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, "", cookieOptions);
  response.cookies.set(SESSION_PERSISTENCE_COOKIE_NAME, "", cookieOptions);
}

async function fetchAuthSession(
  request: NextRequest,
  accessToken: string
): Promise<AuthSessionPayload | null> {
  if (JWT_SECRET.trim()) {
    const token = await verifyAccessToken(accessToken, JWT_SECRET);
    if (!token) {
      return null;
    }
  }

  return fetchBackendAuthSession(request, accessToken);
}

async function fetchBackendAuthSession(
  request: NextRequest,
  accessToken: string
): Promise<AuthSessionPayload | null> {
  const response = await fetch(`${resolveApiUrl(request)}/auth/session`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Backend session lookup failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    permissions?: unknown;
    privateMode?: unknown;
  };
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((entry): entry is string => typeof entry === "string")
    : null;

  if (!permissions) {
    throw new Error("Backend session lookup returned an invalid payload.");
  }

  return {
    permissions,
    privateMode:
      payload.privateMode && typeof payload.privateMode === "object"
        ? (payload.privateMode as AuthSessionPayload["privateMode"])
        : undefined
  };
}

function resolveApiUrl(request: NextRequest): string {
  if (API_URL) {
    return API_URL.replace(/\/$/, "");
  }

  const protocol = request.nextUrl.protocol === "https:" ? "https" : "http";
  return `${protocol}://localhost:5000/api/v1`;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const redirectResponse = NextResponse.redirect(loginUrl);
  clearAuthCookies(redirectResponse);
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  if (ENFORCE_HTTPS && requestProtocol(request) !== "https") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value?.trim();
  if (!accessToken) {
    return redirectToLogin(request);
  }

  let session: AuthSessionPayload | null;

  try {
    session = await fetchAuthSession(request, accessToken);
  } catch (error) {
    console.error("Auth middleware failed", error);
    return new NextResponse("Authentication service unavailable.", {
      status: 503
    });
  }

  if (!session) {
    return redirectToLogin(request);
  }

  const pathname = request.nextUrl.pathname;
  const canAccessAdmin = session.permissions.includes("admin_dashboard");
  const privateModeActive = session.privateMode?.active === true;
  const activationPath = session.privateMode?.activationPath || "/admin/private-mode";
  const blockedPath = session.privateMode?.blockedPath || "/private-mode-required";

  if (!privateModeActive) {
    if (isPrivateModeActivationPath(pathname)) {
      return canAccessAdmin
        ? NextResponse.next()
        : NextResponse.redirect(new URL(blockedPath, request.url));
    }

    if (isPrivateModeBlockedPath(pathname)) {
      return canAccessAdmin
        ? NextResponse.redirect(new URL(activationPath, request.url))
        : NextResponse.next();
    }

    if (isAdminPath(pathname)) {
      return canAccessAdmin
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.redirect(
      new URL(canAccessAdmin ? activationPath : blockedPath, request.url)
    );
  }

  if (isPrivateModeBlockedPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isAdminPath(pathname)) {
    return NextResponse.next();
  }

  if (canAccessAdmin) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/login",
    "/",
    "/c/:path*",
    "/admin/:path*",
    "/private-mode-required",
    "/api/health",
    "/api/session"
  ]
};
