interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  role?: unknown;
  permissions?: unknown;
  exp?: unknown;
}

export interface VerifiedAccessToken {
  sub: string;
  email: string;
  role?: string;
  permissions: string[];
  exp?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<VerifiedAccessToken | null> {
  const trimmedToken = token.trim();
  const trimmedSecret = secret.trim();

  if (!trimmedToken || !trimmedSecret) {
    return null;
  }

  const parts = trimmedToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtSegment<JwtHeader>(encodedHeader);
  const payload = decodeJwtSegment<JwtPayload>(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);

  if (!header || !payload || !signature) {
    return null;
  }

  if (header.alg !== "HS256") {
    return null;
  }

  let verified = false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(trimmedSecret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );
    const signatureBytes = Uint8Array.from(signature);
    const dataBytes = Uint8Array.from(
      encoder.encode(`${encodedHeader}.${encodedPayload}`)
    );

    verified = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      dataBytes as unknown as BufferSource
    );
  } catch {
    return null;
  }

  if (!verified) {
    return null;
  }

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return null;
  }

  if (typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: typeof payload.role === "string" ? payload.role : undefined,
    permissions: Array.isArray(payload.permissions)
      ? payload.permissions.filter((entry): entry is string => typeof entry === "string")
      : [],
    exp: typeof payload.exp === "number" ? payload.exp : undefined
  };
}

function decodeJwtSegment<T>(segment: string): T | null {
  const bytes = decodeBase64Url(segment);
  if (!bytes) {
    return null;
  }

  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = `${normalized}${"=".repeat(paddingLength)}`;

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}
