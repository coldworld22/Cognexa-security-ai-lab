import { randomUUID } from "crypto";

import type { AuthorizedSecurityFinding } from "../../authorized-testing/authorized-security-testing.types";
import type { ModuleExecutionResult, ModuleStateLike, PenetrationTestingModuleContext } from "./module.types";
import {
  buildKeywordRouteCandidates,
  buildParameterizedCandidates,
  collectApiUrls,
  collectPageUrls,
  isCrossOriginRedirectError,
  setProbeParam
} from "./module-utils";

const OAUTH_DISCOVERY_PATHS = [
  "/.well-known/openid-configuration",
  "/oauth/authorize",
  "/oauth2/authorize",
  "/authorize",
  "/oidc/authorize",
  "/sso/authorize",
  "/auth/authorize"
];

const OAUTH_ROUTE_PATTERN =
  /(oauth|oidc|authorize|callback|sso|openid|login|signin)/i;
const OAUTH_REDIRECT_PARAM_PATTERN =
  /^(?:redirect_uri|redirect|return|returnurl|callback|next|continue)$/i;

export async function executeOAuthFlowAbuseModule<
  TRunState extends ModuleStateLike
>(
  context: PenetrationTestingModuleContext<TRunState>
): Promise<ModuleExecutionResult> {
  const findings: AuthorizedSecurityFinding[] = [];
  const warnings: string[] = [];
  const routeCandidates = buildKeywordRouteCandidates(
    context.scan,
    OAUTH_ROUTE_PATTERN,
    OAUTH_DISCOVERY_PATHS
  );
  const parameterCandidates = buildParameterizedCandidates(
    [...collectPageUrls(context.scan), ...collectApiUrls(context.scan), ...routeCandidates],
    ["oauth", "oidc", "authorize", "callback", "sso", "login"]
  ).filter(
    (candidate) =>
      OAUTH_REDIRECT_PARAM_PATTERN.test(candidate.paramName) ||
      /(oauth|oidc|authorize|sso)/i.test(candidate.url.pathname)
  );

  for (const candidate of routeCandidates.slice(0, 4)) {
    const probe = await context.performProbe(context.state, candidate, {
      category: "oauth_flow",
      label: "oauth-metadata-review"
    });

    if (!probe) {
      warnings.push("OAuth flow probes stopped after reaching the request budget.");
      break;
    }

    const riskSummary = evaluateOAuthMetadata(probe.body);
    if (!riskSummary) {
      const pageSignal = extractOAuthPageSignal(probe.body);
      if (!pageSignal) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "oauth_flow",
        severity: "low",
        title: "OAuth entry point did not expose an obvious state marker",
        summary:
          "A login or authorize entry point embedded an OAuth-style authorization request without an obvious state parameter in the visible request template.",
        evidence: [`endpoint=${probe.finalUrl}`, `signal=${pageSignal}`],
        remediation:
          "Ensure OAuth authorization requests include validated state values, use nonce where OIDC applies, and centralize flow construction so redirect and replay protections are applied consistently.",
        safeRetest:
          "Re-fetch the same login or authorize page after the fix and confirm the embedded authorization request includes state and, for OIDC flows, nonce semantics where needed.",
        supportingEventIds: [probe.eventId]
      });

      await context.logEvent(context.state.runId, {
        eventType: "finding",
        severity: "low",
        category: "oauth_flow",
        message: "An OAuth entry point lacked an obvious state marker in the visible authorization request.",
        metadata: {
          endpoint: probe.finalUrl,
          signal: pageSignal
        }
      });
      continue;
    }

    findings.push({
      id: randomUUID(),
      category: "oauth_flow",
      severity: riskSummary.severity,
      title: "OAuth or OIDC metadata exposes legacy or weaker authorization patterns",
      summary: riskSummary.summary,
      evidence: [`endpoint=${probe.finalUrl}`, ...riskSummary.evidence],
      remediation:
        "Prefer authorization code with PKCE, disable implicit and password-based flows where possible, and keep public metadata aligned with the flows your application intentionally supports.",
      safeRetest:
        "Re-fetch the same OAuth or OIDC metadata after the fix and confirm risky response types or grant types are no longer advertised.",
      supportingEventIds: [probe.eventId]
    });

    await context.logEvent(context.state.runId, {
      eventType: "finding",
      severity: riskSummary.severity,
      category: "oauth_flow",
      message: "OAuth or OIDC metadata advertised legacy or weaker authorization patterns.",
      metadata: {
        endpoint: probe.finalUrl,
        indicators: riskSummary.evidence
      }
    });
  }

  for (const candidate of parameterCandidates.slice(0, 4)) {
    const probeToken = `cognexa-oauth-${randomUUID().slice(0, 8)}`;
    const externalTarget = `https://cognexa-oauth.invalid/callback/${probeToken}`;
    const candidateUrl = buildOAuthRedirectProbe(candidate, externalTarget);

    try {
      const probe = await context.performProbe(context.state, candidateUrl, {
        category: "oauth_flow",
        label: "oauth-redirect-uri-probe"
      });

      if (!probe) {
        warnings.push("OAuth flow probes stopped after reaching the request budget.");
        break;
      }

      if (
        !probe.body.includes(externalTarget) ||
        /(redirect_uri_mismatch|invalid redirect|redirect uri is not valid|unsupported redirect)/i.test(
          probe.body
        )
      ) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "oauth_flow",
        severity: "medium",
        title: "OAuth authorize surface reflected a supplied redirect_uri",
        summary:
          "A read-only authorize probe reflected an attacker-controlled redirect_uri value, which can make redirect validation weaknesses easier to exploit if the flow does not enforce a strict allowlist.",
        evidence: [
          `endpoint=${probe.finalUrl}`,
          `parameter=${candidate.paramName}`,
          `redirectUri=${externalTarget}`
        ],
        remediation:
          "Bind redirect_uri values to registered client metadata, compare them after canonicalization, and reject arbitrary absolute destinations in OAuth and OIDC flows.",
        safeRetest:
          "Repeat the same read-only authorize request after the fix and confirm the supplied redirect_uri is rejected or removed from the response.",
        supportingEventIds: [probe.eventId]
      });

      await context.logEvent(context.state.runId, {
        eventType: "finding",
        severity: "medium",
        category: "oauth_flow",
        message: "An OAuth authorize surface reflected a supplied redirect_uri value.",
        metadata: {
          endpoint: probe.finalUrl,
          parameter: candidate.paramName,
          redirectUri: externalTarget
        }
      });
    } catch (error) {
      if (!isCrossOriginRedirectError(error, externalTarget)) {
        throw error;
      }

      findings.push({
        id: randomUUID(),
        category: "oauth_flow",
        severity: "high",
        title: "OAuth authorize route accepted an off-origin redirect_uri",
        summary:
          "A read-only authorize probe caused the application to issue a cross-origin redirect based on the supplied redirect_uri value.",
        evidence: [
          `endpoint=${candidate.url.toString()}`,
          `parameter=${candidate.paramName}`,
          `redirectUri=${externalTarget}`
        ],
        remediation:
          "Restrict redirect_uri values to exact registered destinations, validate them after normalization, and reject authorization requests that supply arbitrary off-origin callbacks.",
        safeRetest:
          "Repeat the same read-only authorize request after the fix and confirm the off-origin redirect_uri is rejected before any redirect occurs.",
        supportingEventIds: []
      });

      await context.logEvent(context.state.runId, {
        eventType: "finding",
        severity: "high",
        category: "oauth_flow",
        message: "An OAuth authorize probe triggered an off-origin redirect_uri flow.",
        metadata: {
          endpoint: candidate.url.toString(),
          parameter: candidate.paramName,
          redirectUri: externalTarget
        }
      });
    }
  }

  if (findings.length === 0 && warnings.length === 0) {
    warnings.push("No OAuth or OIDC routes met the threshold for flow-abuse validation.");
  }

  return { findings, warnings };
}

function evaluateOAuthMetadata(body: string): {
  severity: "medium" | "low";
  summary: string;
  evidence: string[];
} | null {
  const responseTypes = extractStringArray(body, "response_types_supported");
  const grantTypes = extractStringArray(body, "grant_types_supported");
  const riskyResponseTypes = responseTypes.filter(
    (value) =>
      value.toLowerCase() !== "code" &&
      (/\btoken\b/i.test(value) || /\bid_token\b/i.test(value))
  );
  const riskyGrantTypes = grantTypes.filter((value) =>
    /\b(password|implicit)\b/i.test(value)
  );

  if (riskyResponseTypes.length === 0 && riskyGrantTypes.length === 0) {
    return null;
  }

  return {
    severity:
      riskyGrantTypes.some((value) => /password/i.test(value)) ||
      riskyResponseTypes.some((value) => /\bid_token token\b/i.test(value))
        ? "medium"
        : "low",
    summary:
      "The discovered OAuth or OIDC metadata advertised implicit, hybrid, or password-based authorization patterns that are usually harder to defend safely than authorization code with PKCE.",
    evidence: [
      ...(riskyResponseTypes.length > 0
        ? [`responseTypes=${riskyResponseTypes.join(",")}`]
        : []),
      ...(riskyGrantTypes.length > 0
        ? [`grantTypes=${riskyGrantTypes.join(",")}`]
        : [])
    ]
  };
}

function extractOAuthPageSignal(body: string): string | null {
  const authorizeHref = body.match(
    /(?:href|action)=["'][^"']*(?:oauth|oidc|authorize)[^"']*(?:client_id=|response_type=)[^"']*["']/i
  )?.[0];
  if (!authorizeHref) {
    return null;
  }

  if (/state=/.test(authorizeHref)) {
    return null;
  }

  return authorizeHref.slice(0, 160);
}

function buildOAuthRedirectProbe(
  candidate: {
    url: URL;
    paramName: string;
    value: string;
  },
  externalTarget: string
): URL {
  const probe = setProbeParam(candidate, externalTarget);
  if (!probe.searchParams.has("client_id")) {
    probe.searchParams.set("client_id", "cognexa-readonly-probe");
  }
  if (!probe.searchParams.has("response_type")) {
    probe.searchParams.set("response_type", "code");
  }
  if (!probe.searchParams.has("scope")) {
    probe.searchParams.set("scope", "openid profile");
  }

  return probe;
}

function extractStringArray(body: string, propertyName: string): string[] {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const value = parsed[propertyName];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // Fall through to regex extraction.
  }

  const propertyPattern = new RegExp(`"${propertyName}"\\s*:\\s*\\[(.*?)\\]`, "is");
  const raw = body.match(propertyPattern)?.[1];
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.replace(/["'\s]/g, "").trim())
    .filter(Boolean);
}
