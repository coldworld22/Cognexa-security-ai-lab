import { randomUUID } from "crypto";

import type { AuthorizedSecurityFinding } from "../../authorized-testing/authorized-security-testing.types";
import type { ModuleExecutionResult, ModuleStateLike, PenetrationTestingModuleContext } from "./module.types";
import {
  buildKeywordRouteCandidates,
  buildParameterizedCandidates,
  collectApiUrls,
  collectPageUrls,
  setProbeParam
} from "./module-utils";

const WORKFLOW_ROUTE_PATTERN =
  /(checkout|cart|order|billing|invoice|payment|subscription|redeem|coupon|promo|discount|credit|balance|transfer|approve|review|invite|trial|upgrade|downgrade|workflow|wizard|step)/i;
const WORKFLOW_PARAM_PATTERN =
  /^(?:step|stage|status|flow|mode|action|phase|coupon|promo|discount|quantity|amount|plan)$/i;

export async function executeBusinessLogicAbuseModule<
  TRunState extends ModuleStateLike
>(
  context: PenetrationTestingModuleContext<TRunState>
): Promise<ModuleExecutionResult> {
  const findings: AuthorizedSecurityFinding[] = [];
  const warnings: string[] = [];
  const routeCandidates = buildKeywordRouteCandidates(
    context.scan,
    WORKFLOW_ROUTE_PATTERN
  );
  const parameterCandidates = buildParameterizedCandidates(
    [...collectPageUrls(context.scan), ...collectApiUrls(context.scan)],
    [
      "checkout",
      "cart",
      "order",
      "billing",
      "invoice",
      "payment",
      "subscription",
      "redeem",
      "coupon",
      "promo",
      "discount",
      "transfer",
      "approve",
      "review",
      "workflow",
      "step"
    ]
  ).filter(
    (candidate) =>
      WORKFLOW_PARAM_PATTERN.test(candidate.paramName) ||
      WORKFLOW_ROUTE_PATTERN.test(candidate.url.pathname)
  );
  const privilegedProfile = context.authProfiles.find(
    (profile) => profile.role === "high_privilege"
  );
  const comparisonProfiles = context.authProfiles.filter(
    (profile) => profile.role !== "high_privilege"
  );

  for (const candidate of parameterCandidates.slice(0, 3)) {
    const baseline = await context.performProbe(context.state, candidate.url, {
      category: "business_logic",
      label: "workflow-baseline"
    });
    if (!baseline) {
      warnings.push("Business-logic probes stopped after reaching the request budget.");
      break;
    }

    const mutatedValue = mutatedWorkflowValue(candidate.paramName);
    const probe = await context.performProbe(
      context.state,
      setProbeParam(candidate, mutatedValue),
      {
        category: "business_logic",
        label: "workflow-step-probe"
      }
    );
    if (!probe) {
      warnings.push("Business-logic probes stopped after reaching the request budget.");
      break;
    }

    if (
      probe.status !== 200 ||
      probe.bodyHash === baseline.bodyHash ||
      !containsCompletionSignal(probe.body)
    ) {
      continue;
    }

    findings.push({
      id: randomUUID(),
      category: "business_logic",
      severity: "medium",
      title: "Workflow parameter influenced a completion-like response",
      summary:
        "A read-only step or workflow mutation changed the response toward a completion or approval state, which suggests the flow may trust client-controlled progression signals too heavily.",
      evidence: [
        `endpoint=${probe.finalUrl}`,
        `parameter=${candidate.paramName}`,
        `baselineStatus=${baseline.status}`,
        `probeStatus=${probe.status}`,
        `mutatedValue=${mutatedValue}`
      ],
      remediation:
        "Bind workflow progression to a server-side state machine, validate that each step is reachable only from the prior authorized state, and reject completion or approval transitions that depend only on query parameters.",
      safeRetest:
        "Repeat the same read-only workflow mutation after the fix and confirm the application rejects direct progression to completion-like states.",
      supportingEventIds: [baseline.eventId, probe.eventId]
    });

    await context.logEvent(context.state.runId, {
      eventType: "finding",
      severity: "medium",
      category: "business_logic",
      message: "A workflow parameter mutation changed the response toward a completion-like state.",
      metadata: {
        endpoint: probe.finalUrl,
        parameter: candidate.paramName,
        mutatedValue
      }
    });
  }

  if (privilegedProfile && comparisonProfiles.length > 0) {
    for (const candidate of routeCandidates.slice(0, 3)) {
      const highProbe = await context.performProbe(context.state, candidate, {
        category: "business_logic",
        label: "workflow-high",
        authProfile: privilegedProfile
      });

      if (!highProbe) {
        warnings.push("Business-logic probes stopped after reaching the request budget.");
        break;
      }

      for (const profile of comparisonProfiles.slice(0, 2)) {
        const probe = await context.performProbe(context.state, candidate, {
          category: "business_logic",
          label: `workflow-${profile.role}`,
          authProfile: profile
        });

        if (!probe) {
          warnings.push("Business-logic probes stopped after reaching the request budget.");
          break;
        }

        if (
          highProbe.status !== 200 ||
          probe.status !== 200 ||
          probe.bodyHash !== highProbe.bodyHash
        ) {
          continue;
        }

        findings.push({
          id: randomUUID(),
          category: "business_logic",
          severity: "high",
          title: "Lower-trust profile reached the same sensitive workflow view",
          summary:
            "A lower-trust profile received the same successful response as the privileged profile for a workflow or approval route that appears business-sensitive.",
          evidence: [
            `endpoint=${probe.finalUrl}`,
            `comparisonRole=${profile.role}`,
            `highStatus=${highProbe.status}`,
            `comparisonStatus=${probe.status}`
          ],
          remediation:
            "Enforce server-side business rules per workflow step, bind approvals and billing flows to the authenticated principal, and add negative tests for each role before sensitive views or actions are exposed.",
          safeRetest:
            "Repeat the same GET request with the lower-trust profile and confirm it now receives a challenge, a reduced workflow view, or an explicit denial.",
          supportingEventIds: [highProbe.eventId, probe.eventId]
        });

        await context.logEvent(context.state.runId, {
          eventType: "finding",
          severity: "high",
          category: "business_logic",
          message: "A lower-trust profile reached the same sensitive workflow view as the privileged profile.",
          metadata: {
            endpoint: probe.finalUrl,
            comparisonRole: profile.role
          }
        });
      }
    }
  } else if (routeCandidates.length > 0) {
    warnings.push(
      "Business-logic privilege-differential checks were skipped because high- and lower-trust auth profiles were not both provided."
    );
  }

  if (findings.length === 0 && warnings.length === 0) {
    warnings.push("No workflow routes met the threshold for business-logic abuse testing.");
  }

  return { findings, warnings };
}

function mutatedWorkflowValue(paramName: string): string {
  const normalized = paramName.toLowerCase();
  if (/(coupon|promo|discount)/.test(normalized)) {
    return "stacked";
  }
  if (/(quantity|amount)/.test(normalized)) {
    return "0";
  }
  if (/(plan)/.test(normalized)) {
    return "enterprise";
  }

  return "complete";
}

function containsCompletionSignal(body: string): boolean {
  return /(order complete|payment approved|subscription active|invite accepted|success|receipt|confirmed|approval complete|discount applied|trial active)/i.test(
    body
  );
}
