import { randomUUID } from "crypto";

import type { AuthorizedSecurityFinding } from "../../authorized-testing/authorized-security-testing.types";
import type { PenetrationTestingModuleContext, ModuleExecutionResult, ModuleStateLike } from "./module.types";
import {
  buildParameterizedCandidates,
  collectApiUrls,
  collectPageUrls,
  setProbeParam
} from "./module-utils";

const SSRF_PATH_KEYWORDS = [
  "fetch",
  "proxy",
  "url",
  "uri",
  "link",
  "image",
  "avatar",
  "render",
  "feed",
  "import",
  "callback",
  "webhook",
  "preview",
  "resource",
  "endpoint"
];

const SSRF_PARAM_PATTERN =
  /^(?:url|uri|dest|destination|link|feed|image|avatar|resource|endpoint|callback|returnurl|target)$/i;

export async function executeSsrfDetectionModule<
  TRunState extends ModuleStateLike
>(
  context: PenetrationTestingModuleContext<TRunState>
): Promise<ModuleExecutionResult> {
  const findings: AuthorizedSecurityFinding[] = [];
  const warnings: string[] = [];
  const candidates = buildParameterizedCandidates(
    [...collectPageUrls(context.scan), ...collectApiUrls(context.scan)],
    SSRF_PATH_KEYWORDS
  ).filter(
    (candidate) =>
      SSRF_PARAM_PATTERN.test(candidate.paramName) ||
      SSRF_PATH_KEYWORDS.some((keyword) =>
        candidate.url.pathname.toLowerCase().includes(keyword)
      )
  );

  if (candidates.length === 0) {
    warnings.push("No URL-handling endpoints were discovered for SSRF-oriented review.");
    return { findings, warnings };
  }

  for (const candidate of candidates.slice(0, 4)) {
    const baseline = await context.performProbe(context.state, candidate.url, {
      category: "ssrf",
      label: "ssrf-baseline"
    });
    if (!baseline) {
      warnings.push("SSRF probes stopped after reaching the request budget.");
      break;
    }

    const probeToken = `cognexa-ssrf-${randomUUID().slice(0, 8)}`;
    const sameOriginTarget = new URL(
      `/robots.txt?cognexa_ssrf_probe=${probeToken}`,
      context.state.requestedUrl.origin
    );
    const probe = await context.performProbe(
      context.state,
      setProbeParam(candidate, sameOriginTarget.toString()),
      {
        category: "ssrf",
        label: "ssrf-same-origin-fetch"
      }
    );

    if (!probe) {
      warnings.push("SSRF probes stopped after reaching the request budget.");
      break;
    }

    const probeBody = probe.body.toLowerCase();
    const sameOriginFetchObserved =
      probe.bodyHash !== baseline.bodyHash &&
      (probeBody.includes("user-agent") ||
        probeBody.includes("disallow:") ||
        probeBody.includes("allow:") ||
        probeBody.includes(probeToken.toLowerCase()) ||
        probeBody.includes(sameOriginTarget.pathname.toLowerCase()));
    const fetcherErrorObserved =
      probe.status >= 500 &&
      /(upstream|failed to fetch|request failed|unsupported protocol|invalid url|socket|timeout|connection|lookup)/i.test(
        probe.body
      );

    if (!sameOriginFetchObserved && !fetcherErrorObserved) {
      continue;
    }

    const supportingEventIds = [baseline.eventId, probe.eventId];
    findings.push({
      id: randomUUID(),
      category: "ssrf",
      severity: sameOriginFetchObserved ? "medium" : "low",
      title: "URL-handling endpoint appears to perform server-side retrieval",
      summary:
        sameOriginFetchObserved
          ? "A read-only same-origin URL probe changed the response in a way that suggests the application fetched server-side content on behalf of the user."
          : "A read-only URL probe triggered server-side fetch-style error handling on an endpoint that accepts URL-like input.",
      evidence: [
        `endpoint=${probe.finalUrl}`,
        `parameter=${candidate.paramName}`,
        `sameOriginTarget=${sameOriginTarget.toString()}`,
        `baselineStatus=${baseline.status}`,
        `probeStatus=${probe.status}`
      ],
      remediation:
        "Restrict URL-fetching features to explicit allowlists, canonicalize and validate destinations server-side, block link-local and private-address ranges, and separate fetch utilities from user-controlled URLs.",
      safeRetest:
        "Repeat the same same-origin URL probe after the fix and confirm the endpoint rejects arbitrary destinations or only serves pre-approved internal resources.",
      supportingEventIds
    });

    await context.logEvent(context.state.runId, {
      eventType: "finding",
      severity: sameOriginFetchObserved ? "medium" : "low",
      category: "ssrf",
      message: "A URL-handling endpoint showed server-side retrieval behavior under a read-only probe.",
      metadata: {
        endpoint: probe.finalUrl,
        parameter: candidate.paramName,
        sameOriginTarget: sameOriginTarget.toString(),
        baselineStatus: baseline.status,
        probeStatus: probe.status
      }
    });
  }

  return { findings, warnings };
}
