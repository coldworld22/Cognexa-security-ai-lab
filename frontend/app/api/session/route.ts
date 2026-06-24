import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  SESSION_PERSISTENCE_COOKIE_NAME,
  getAuthCookieOptions,
  getClearedAuthCookieOptions,
  normalizeSessionPersistence
} from "@/lib/auth-cookies";

interface SessionCookiePayload {
  accessToken?: unknown;
  refreshToken?: unknown;
  persistence?: unknown;
}

function clearSessionCookies(response: NextResponse) {
  const clearedCookieOptions = getClearedAuthCookieOptions();

  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, "", clearedCookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, "", clearedCookieOptions);
  response.cookies.set(SESSION_PERSISTENCE_COOKIE_NAME, "", clearedCookieOptions);
}

export async function POST(request: NextRequest) {
  let payload: SessionCookiePayload;

  try {
    payload = (await request.json()) as SessionCookiePayload;
  } catch {
    return NextResponse.json(
      {
        error: "A valid JSON session payload is required."
      },
      {
        status: 400
      }
    );
  }

  const accessToken =
    typeof payload.accessToken === "string" ? payload.accessToken.trim() : "";
  const refreshToken =
    typeof payload.refreshToken === "string" ? payload.refreshToken.trim() : "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      {
        error: "Both accessToken and refreshToken are required."
      },
      {
        status: 400
      }
    );
  }

  const persistence = normalizeSessionPersistence(
    typeof payload.persistence === "string" ? payload.persistence : null
  );
  const response = NextResponse.json({
    ok: true
  });
  const cookieOptions = getAuthCookieOptions(persistence);

  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, accessToken, cookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions);
  response.cookies.set(
    SESSION_PERSISTENCE_COOKIE_NAME,
    persistence,
    cookieOptions
  );

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({
    ok: true
  });

  clearSessionCookies(response);
  return response;
}
