import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  SESSION_PERSISTENCE_COOKIE_NAME,
  getClearedAuthCookieOptions
} from "@/lib/auth-cookies";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

interface AuthSessionPayload {
  permissions?: string[];
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

async function fetchAuthSession(accessToken: string): Promise<Response> {
  return fetch(`${API_URL}/auth/session`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
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

  let sessionResponse: Response;

  try {
    sessionResponse = await fetchAuthSession(accessToken);
  } catch {
    return new NextResponse("Authentication service unavailable.", {
      status: 503
    });
  }

  if (!sessionResponse.ok) {
    return redirectToLogin(request);
  }

  if (!isAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = (await sessionResponse.json()) as AuthSessionPayload;
  if (session.permissions?.includes("admin_dashboard")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/", "/c/:path*", "/admin/:path*"]
};
