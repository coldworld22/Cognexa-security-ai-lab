import { AppError } from "../../../utils/app-error";
import type { WebsiteScanResult } from "../../website-scanner/website-scanner.service";
import type { ProbeResponseSummary } from "./module.types";

export interface ParameterizedCandidate {
  url: URL;
  paramName: string;
  value: string;
}

export function dedupeUrls(urls: URL[]): URL[] {
  const unique = new Map<string, URL>();
  for (const url of urls) {
    const normalized = new URL(url.toString());
    normalized.hash = "";
    unique.set(normalized.toString(), normalized);
  }

  return [...unique.values()];
}

export function collectPageUrls(scan: WebsiteScanResult): URL[] {
  return dedupeUrls(
    [scan.finalUrl, ...scan.pages.map((page) => page.url)].map((value) => new URL(value))
  );
}

export function buildParameterizedCandidates(
  urls: URL[],
  keywords: string[]
): ParameterizedCandidate[] {
  const candidates: ParameterizedCandidate[] = [];

  for (const original of urls) {
    const url = new URL(original);
    if ([...url.searchParams.keys()].length > 0) {
      for (const [paramName, value] of url.searchParams.entries()) {
        candidates.push({
          url,
          paramName,
          value: value || "1"
        });
      }
      continue;
    }

    const path = url.pathname.toLowerCase();
    const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
    if (keywords.some((keyword) => path.includes(keyword))) {
      candidates.push({
        url,
        paramName:
          path.includes("search") || path.includes("query")
            ? "q"
            : path.includes("redirect") ||
                path.includes("return") ||
                path.includes("next")
              ? "next"
              : "id",
        value: /\d+$/.test(lastSegment) ? lastSegment.match(/\d+$/)?.[0] ?? "1" : "1"
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.url.toString()}::${candidate.paramName}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildApiCandidates(scan: WebsiteScanResult): URL[] {
  const origin = new URL(scan.finalUrl).origin;
  const exposureCandidates = scan.exposures.endpoints
    .map((endpoint) => {
      try {
        return new URL(endpoint.url);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => Boolean(url));

  return dedupeUrls([
    ...exposureCandidates,
    ...collectPageUrls(scan).filter((url) => isApiLikePath(url)),
    new URL("/openapi.json", origin),
    new URL("/swagger.json", origin),
    new URL("/api-docs", origin),
    new URL("/v3/api-docs", origin),
    new URL("/graphql", origin),
    new URL("/graphiql", origin),
    new URL("/api", origin),
    new URL("/api/v1", origin),
    new URL("/api/v2", origin),
    new URL("/api/me", origin),
    new URL("/api/users", origin),
    new URL("/api/admin", origin),
    new URL("/api/profile", origin),
    new URL("/api/settings", origin),
    new URL("/api/search?q=1", origin),
    new URL("/api/redirect?next=/dashboard", origin),
    new URL("/api/users/1", origin),
    new URL("/api/orders/1", origin)
  ]).filter((url) => isApiLikePath(url));
}

export function collectApiUrls(scan: WebsiteScanResult): URL[] {
  return buildApiCandidates(scan).filter((candidate) =>
    /(?:^\/api(?:\/|$)|^\/graphql(?:\/|$))/i.test(candidate.pathname)
  );
}

export function buildApiDocumentationCandidates(scan: WebsiteScanResult): URL[] {
  return buildApiCandidates(scan).filter((candidate) => isApiDocumentationPath(candidate));
}

export function buildSensitiveApiRouteCandidates(scan: WebsiteScanResult): URL[] {
  const origin = new URL(scan.finalUrl).origin;
  return dedupeUrls([
    ...collectApiUrls(scan),
    new URL("/api/account", origin),
    new URL("/api/internal", origin),
    new URL("/api/config", origin)
  ]).filter(
    (candidate) =>
      !isApiDocumentationPath(candidate) &&
      /(?:^\/api(?:\/|$)|^\/graphql(?:\/|$))/i.test(candidate.pathname) &&
      /(admin|account|profile|config|internal|settings|users|roles|permissions|session|token|search|query|redirect|graphql|orders)/i.test(
        candidate.pathname
      )
  );
}

export function isApiLikePath(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/graphql" ||
    pathname.startsWith("/graphql/") ||
    isApiDocumentationPath(url)
  );
}

export function isApiDocumentationPath(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  return (
    /(?:^|\/)(?:openapi(?:\.json)?|swagger(?:\.json)?|v\d+\/api-docs|api-docs|graphi?ql|playground)(?:$|\/)/i.test(
      pathname
    ) ||
    pathname === "/graphql" ||
    pathname.startsWith("/graphql/")
  );
}

export function isApiDocumentationResponse(probe: ProbeResponseSummary): boolean {
  let matchesDocumentationPath = false;
  if (probe.finalUrl) {
    try {
      matchesDocumentationPath = isApiDocumentationPath(new URL(probe.finalUrl));
    } catch {
      matchesDocumentationPath = false;
    }
  }

  return (
    matchesDocumentationPath ||
    /(openapi|swagger-ui|swagger ui|redoc|graphql playground|graphiql|apollo sandbox|"paths"\s*:|"components"\s*:)/i.test(
      probe.body
    )
  );
}

export function isReadableApiResponse(probe: ProbeResponseSummary): boolean {
  return (
    /json|javascript|text\/plain|text\/html|graphql/i.test(probe.contentType) ||
    /^[\[{]/.test(probe.body.trim())
  );
}

export function hasStateChangingApiSurface(body: string): boolean {
  return /["'](?:post|put|patch|delete)["']\s*:|\bmutation\b|^\s*(post|put|patch|delete)\s*:/gim.test(
    body
  );
}

export function hasCookieAuthHints(body: string): boolean {
  return /(cookieauth|cookie auth|cookie|session|xsrf|csrf|set-cookie|samesite)/i.test(
    body
  );
}

export function bodyHasSensitiveApiFields(body: string): string[] {
  const fields = new Set<string>();
  const fieldPattern =
    /["']?(email|role|roles|permission|permissions|api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|session|tenant[_-]?id|internal[_-]?id|customer[_-]?id|password|phone|address|ssn)["']?\s*:/gi;
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(body)) !== null) {
    fields.add(match[1]!.toLowerCase());
    if (fields.size >= 6) {
      break;
    }
  }

  return [...fields];
}

export function readLocation(details: unknown): string | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const candidate = (details as Record<string, unknown>).to;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

export function isCrossOriginRedirectError(
  error: unknown,
  expectedTarget: string
): boolean {
  return (
    error instanceof AppError &&
    error.message.includes("Redirects to a different origin are blocked") &&
    readLocation(error.details)?.startsWith(expectedTarget) === true
  );
}

export function setProbeParam(
  candidate: ParameterizedCandidate,
  value: string
): URL {
  const probeUrl = new URL(candidate.url);
  probeUrl.searchParams.set(candidate.paramName, value);
  return probeUrl;
}

export function hasCsrfTokenMarkers(body: string): boolean {
  return /(?:csrf|xsrf|authenticity_token|__requestverificationtoken|anti[-_]?forgery|_token|csrf-token|x-csrf-token)/i.test(
    body
  );
}

export function buildKeywordRouteCandidates(
  scan: WebsiteScanResult,
  keywords: RegExp,
  extraPaths: string[] = []
): URL[] {
  const origin = new URL(scan.finalUrl).origin;
  return dedupeUrls([
    ...collectPageUrls(scan),
    ...collectApiUrls(scan),
    ...extraPaths.map((path) => new URL(path, origin))
  ]).filter((candidate) => keywords.test(candidate.pathname));
}
