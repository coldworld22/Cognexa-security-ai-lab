import { randomUUID } from "crypto";

import type { AuthorizedSecurityFinding } from "../../authorized-testing/authorized-security-testing.types";
import type { ModuleExecutionResult, ModuleStateLike, PenetrationTestingModuleContext } from "./module.types";
import {
  buildApiDocumentationCandidates,
  buildKeywordRouteCandidates,
  hasCookieAuthHints,
  hasCsrfTokenMarkers,
  hasStateChangingApiSurface,
  isApiDocumentationResponse
} from "./module-utils";

const FORM_ROUTE_PATTERN =
  /(login|sign(?:in|up)|account|settings|profile|billing|checkout|order|payment|transfer|invite|subscription|redeem|coupon|promo)/i;

export async function executeCsrfTestingModule<
  TRunState extends ModuleStateLike
>(
  context: PenetrationTestingModuleContext<TRunState>
): Promise<ModuleExecutionResult> {
  const findings: AuthorizedSecurityFinding[] = [];
  const warnings: string[] = [];
  const formCandidates = buildKeywordRouteCandidates(context.scan, FORM_ROUTE_PATTERN).filter(
    (candidate) =>
      context.scan.pages.some(
        (page) =>
          page.url === candidate.toString() &&
          (page.formCount > 0 || page.loginFormCount > 0)
      ) || FORM_ROUTE_PATTERN.test(candidate.pathname)
  );

  for (const candidate of formCandidates.slice(0, 4)) {
    const probe = await context.performProbe(context.state, candidate, {
      category: "csrf",
      label: "csrf-form-review"
    });

    if (!probe) {
      warnings.push("CSRF probes stopped after reaching the request budget.");
      break;
    }

    const containsForm = /<form\b/i.test(probe.body);
    const stateChangingHints =
      /method=["']post["']|csrf|token|transfer|checkout|payment|save settings|update profile|redeem|invite/i.test(
        probe.body
      ) || FORM_ROUTE_PATTERN.test(candidate.pathname);
    const csrfMarkersPresent = hasCsrfTokenMarkers(probe.body);
    const missingSameSite = context.scan.cookies.missingSameSite > 0;

    if (!containsForm || !stateChangingHints || csrfMarkersPresent || !missingSameSite) {
      continue;
    }

    findings.push({
      id: randomUUID(),
      category: "csrf",
      severity: "medium",
      title: "Cookie-backed form flow did not expose obvious anti-CSRF markers",
      summary:
        "A stateful form flow was reachable while the passive baseline still observed cookies without SameSite protection, and the read-only page review did not reveal clear CSRF token markers.",
      evidence: [
        `endpoint=${probe.finalUrl}`,
        `missingSameSite=${context.scan.cookies.missingSameSite}`,
        "csrfMarkers=absent"
      ],
      remediation:
        "Require anti-CSRF tokens or strict origin checks on state-changing flows, keep session cookies on SameSite=Lax or stronger by default, and avoid relying on cookie presence alone for trusted actions.",
      safeRetest:
        "Re-fetch the same form after the fix and confirm the page emits an anti-CSRF token or an equivalent origin-bound protection while cookies use a stronger SameSite policy.",
      supportingEventIds: [probe.eventId]
    });

    await context.logEvent(context.state.runId, {
      eventType: "finding",
      severity: "medium",
      category: "csrf",
      message: "A cookie-backed form flow lacked obvious anti-CSRF markers under read-only review.",
      metadata: {
        endpoint: probe.finalUrl,
        missingSameSite: context.scan.cookies.missingSameSite
      }
    });
  }

  const documentationCandidates = buildApiDocumentationCandidates(context.scan);
  for (const candidate of documentationCandidates.slice(0, 2)) {
    const probe = await context.performProbe(context.state, candidate, {
      category: "csrf",
      label: "csrf-api-docs"
    });

    if (!probe) {
      warnings.push("CSRF probes stopped after reaching the request budget.");
      break;
    }

    if (
      probe.status !== 200 ||
      !isApiDocumentationResponse(probe) ||
      !hasStateChangingApiSurface(probe.body) ||
      !hasCookieAuthHints(probe.body) ||
      context.scan.cookies.missingSameSite === 0
    ) {
      continue;
    }

    findings.push({
      id: randomUUID(),
      category: "csrf",
      severity: "medium",
      title: "Cookie-authenticated API surface may rely on weak CSRF boundaries",
      summary:
        "A public API description exposed state-changing operations while the baseline still showed cookies without SameSite protection and the documentation hinted at cookie-backed authentication.",
      evidence: [
        `endpoint=${probe.finalUrl}`,
        `missingSameSite=${context.scan.cookies.missingSameSite}`,
        "stateChangingOperations=true"
      ],
      remediation:
        "Require explicit anti-CSRF validation or origin checks on state-changing API routes, strengthen SameSite defaults for session cookies, and reduce public exposure of mutable API contracts where possible.",
      safeRetest:
        "Repeat the same documentation fetch after the fix and confirm the mutable API flow either requires stronger CSRF controls or no longer advertises cookie-backed state-changing operations publicly.",
      supportingEventIds: [probe.eventId]
    });

    await context.logEvent(context.state.runId, {
      eventType: "finding",
      severity: "medium",
      category: "csrf",
      message: "API documentation and cookie posture suggest a CSRF review is needed.",
      metadata: {
        endpoint: probe.finalUrl,
        missingSameSite: context.scan.cookies.missingSameSite
      }
    });
  }

  if (findings.length === 0 && warnings.length === 0) {
    warnings.push("No cookie-backed form or API flows met the threshold for CSRF-focused validation.");
  }

  return { findings, warnings };
}
