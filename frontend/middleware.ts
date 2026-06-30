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

interface AuthSessionPayload {
  permissions: string[];
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
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
    if (token) {
      return {
        permissions: token.permissions
      };
    }

    return null;
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
  };
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((entry): entry is string => typeof entry === "string")
    : null;

  if (!permissions) {
    throw new Error("Backend session lookup returned an invalid payload.");
  }

  return {
    permissions
  };
}

function resolveApiUrl(request: NextRequest): string {
  if (API_URL) {
    try {
      const parsedUrl = new URL(API_URL);

      if (
        request.nextUrl.protocol === "http:" &&
        parsedUrl.protocol === "https:" &&
        isLocalhostHostname(request.nextUrl.hostname) &&
        isLocalhostHostname(parsedUrl.hostname)
      ) {
        parsedUrl.protocol = "http:";
        return parsedUrl.toString().replace(/\/$/, "");
      }
    } catch {
      return API_URL.replace(/\/$/, "");
    }

    return API_URL.replace(/\/$/, "");
  }

  const protocol = request.nextUrl.protocol === "https:" ? "https" : "http";
  return `${protocol}://localhost:5000/api/v1`;
}

function isLocalhostHostname(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1"
  );
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const redirectResponse = NextResponse.redirect(loginUrl);
  clearAuthCookies(redirectResponse);
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
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

  if (!isAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (session.permissions.includes("admin_dashboard")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/", "/c/:path*", "/admin/:path*"]
};
