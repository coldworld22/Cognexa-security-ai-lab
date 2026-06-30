import { randomUUID } from "crypto";

import type { AuthorizedSecurityFinding } from "../../authorized-testing/authorized-security-testing.types";
import type { ModuleExecutionResult, ModuleStateLike, PenetrationTestingModuleContext } from "./module.types";
import {
  buildParameterizedCandidates,
  collectApiUrls,
  collectPageUrls,
  isCrossOriginRedirectError,
  setProbeParam
} from "./module-utils";

const REDIRECT_KEYWORDS = [
  "redirect",
  "return",
  "next",
  "continue",
  "callback",
  "logout",
  "oauth",
  "sso"
];

const REDIRECT_PARAM_PATTERN =
  /^(?:next|return|returnurl|redirect|redirect_uri|continue|dest|destination|url|target|callback)$/i;

export async function executeOpenRedirectTestingModule<
  TRunState extends ModuleStateLike
>(
  context: PenetrationTestingModuleContext<TRunState>
): Promise<ModuleExecutionResult> {
  const findings: AuthorizedSecurityFinding[] = [];
  const warnings: string[] = [];
  const candidates = buildParameterizedCandidates(
    [...collectPageUrls(context.scan), ...collectApiUrls(context.scan)],
    REDIRECT_KEYWORDS
  ).filter(
    (candidate) =>
      REDIRECT_PARAM_PATTERN.test(candidate.paramName) ||
      REDIRECT_KEYWORDS.some((keyword) =>
        candidate.url.pathname.toLowerCase().includes(keyword)
      )
  );

  if (candidates.length === 0) {
    warnings.push("No redirect-style parameters were discovered for open redirect testing.");
    return { findings, warnings };
  }

  for (const candidate of candidates.slice(0, 4)) {
    const probeToken = `cognexa-redirect-${randomUUID().slice(0, 8)}`;
    const externalTarget = `https://cognexa-probe.invalid/${probeToken}`;

    try {
      const probe = await context.performProbe(
        context.state,
        setProbeParam(candidate, externalTarget),
        {
          category: "open_redirect",
          label: "open-redirect-probe"
        }
      );

      if (!probe) {
        warnings.push("Open redirect probes stopped after reaching the request budget.");
        break;
      }

      const reflected =
        probe.body.includes(externalTarget) ||
        probe.body.includes(decodeURIComponent(externalTarget));
      if (!reflected) {
        continue;
      }

      findings.push({
        id: randomUUID(),
        category: "open_redirect",
        severity: "low",
        title: "Redirect target appears to be reflected without clear validation",
        summary:
          "A redirect-style parameter was reflected back in the response, which can make redirect handling easier to abuse if target validation is weak elsewhere in the flow.",
        evidence: [
          `endpoint=${probe.finalUrl}`,
          `parameter=${candidate.paramName}`,
          `target=${externalTarget}`
        ],
        remediation:
          "Restrict redirect destinations to explicit allowlists, normalize relative navigation targets server-side, and reject absolute off-origin redirect values by default.",
        safeRetest:
          "Repeat the same GET request after the fix and confirm the off-origin target is rejected or normalized to an approved same-origin destination.",
        supportingEventIds: [probe.eventId]
      });

      await context.logEvent(context.state.runId, {
        eventType: "finding",
        severity: "low",
        category: "open_redirect",
        message: "A redirect-style parameter was reflected without obvious validation.",
        metadata: {
          endpoint: probe.finalUrl,
          parameter: candidate.paramName,
          target: externalTarget
        }
      });
    } catch (error) {
      if (!isCrossOriginRedirectError(error, externalTarget)) {
        throw error;
      }

      findings.push({
        id: randomUUID(),
        category: "open_redirect",
        severity: "high",
        title: "Redirect parameter triggered an off-origin navigation",
        summary:
          "A read-only redirect probe caused the application to issue a cross-origin redirect based on attacker-controlled input.",
        evidence: [
          `endpoint=${candidate.url.toString()}`,
          `parameter=${candidate.paramName}`,
          `target=${externalTarget}`
        ],
        remediation:
          "Restrict redirect destinations to a strict same-origin or allowlisted set, resolve and compare destinations after canonicalization, and reject arbitrary absolute URLs in redirect parameters.",
        safeRetest:
          "Repeat the same GET request after the fix and confirm the off-origin target is rejected or replaced with a safe same-origin fallback.",
        supportingEventIds: []
      });

      await context.logEvent(context.state.runId, {
        eventType: "finding",
        severity: "high",
        category: "open_redirect",
        message: "A redirect parameter triggered an off-origin redirect during a read-only probe.",
        metadata: {
          endpoint: candidate.url.toString(),
          parameter: candidate.paramName,
          target: externalTarget
        }
      });
    }
  }

  return { findings, warnings };
}
