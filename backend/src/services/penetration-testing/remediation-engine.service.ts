import { randomUUID } from "crypto";

import type {
  AttackChain,
  Vulnerability,
  PenetrationTestRemediationPlan,
  PenetrationTestRemediationPriority,
  PenetrationTestRemediationWorkItem,
  PenetrationTestRemediationOwner
} from "./penetration-test-orchestrator.service";

const OWNER_BY_TYPE: Record<string, PenetrationTestRemediationOwner> = {
  sql_injection: "data",
  xss: "application",
  csrf: "application",
  authentication: "identity",
  authorization: "identity",
  api_security: "platform",
  ssrf: "platform",
  open_redirect: "application",
  business_logic: "product",
  oauth_flow: "identity",
  waf: "security",
  session_management: "identity"
};

const TITLE_BY_TYPE: Record<string, string> = {
  sql_injection: "Eliminate unsafe database query construction",
  xss: "Neutralize script injection paths",
  csrf: "Require anti-CSRF protections on sensitive workflows",
  authentication: "Restore authentication gates on privileged surfaces",
  authorization: "Enforce role-based authorization consistently",
  api_security: "Reduce public API discovery and least-privilege gaps",
  ssrf: "Constrain server-side outbound fetch behavior",
  open_redirect: "Restrict redirect destinations to trusted allowlists",
  business_logic: "Add invariant checks to sensitive workflows",
  oauth_flow: "Tighten OAuth client, callback, and token validation",
  waf: "Tune edge protections without relying on them as the primary control",
  session_management: "Harden session lifecycle and cookie protections"
};

export class RemediationEngine {
  buildPlan(
    vulnerabilities: Vulnerability[],
    attackChains: AttackChain[]
  ): PenetrationTestRemediationPlan {
    const workItems = this.buildWorkItems(vulnerabilities, attackChains);
    const quickWins = workItems
      .filter((item) => item.priority === "immediate" || item.priority === "high")
      .slice(0, 3)
      .map((item) => item.title);
    const strategicFixes = this.uniqueStrings([
      ...workItems
        .filter((item) => item.priority === "high" || item.priority === "medium")
        .map((item) => item.summary),
      attackChains.length > 0
        ? "Review the validated chain as a trust-boundary failure, not as isolated findings, and close the full path in one remediation cycle."
        : "",
      vulnerabilities.some((vulnerability) =>
        ["authentication", "authorization", "session_management"].includes(vulnerability.type)
      )
        ? "Centralize identity and session enforcement so privileged routes inherit the same control plane."
        : "",
      vulnerabilities.some((vulnerability) =>
        ["api_security", "ssrf", "oauth_flow", "waf"].includes(vulnerability.type)
      )
        ? "Pair application-layer fixes with platform controls so public edge and backend trust boundaries stay aligned."
        : ""
    ]).slice(0, 4);

    return {
      headline:
        workItems[0]?.priority === "immediate"
          ? "Immediate remediation is required for the highest-confidence trust-boundary failures."
          : workItems.length > 0
            ? "Prioritize the highest-confidence trust-boundary gaps before expanding test scope."
            : "No remediation items were generated from the current report artifact.",
      quickWins,
      strategicFixes,
      workItems
    };
  }

  private buildWorkItems(
    vulnerabilities: Vulnerability[],
    attackChains: AttackChain[]
  ): PenetrationTestRemediationWorkItem[] {
    const grouped = new Map<string, Vulnerability[]>();
    for (const vulnerability of vulnerabilities) {
      const key = vulnerability.type.trim().toLowerCase() || "general";
      const current = grouped.get(key);
      if (current) {
        current.push(vulnerability);
      } else {
        grouped.set(key, [vulnerability]);
      }
    }

    const workItems = Array.from(grouped.entries()).map(([type, findings]) =>
      this.toWorkItem(type, findings, attackChains)
    );

    return workItems.sort((left, right) => {
      const priorityDelta = this.comparePriority(left.priority, right.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    });
  }

  private toWorkItem(
    type: string,
    findings: Vulnerability[],
    attackChains: AttackChain[]
  ): PenetrationTestRemediationWorkItem {
    const sortedFindings = [...findings].sort((left, right) => {
      const severityDelta = this.compareSeverity(right.severity, left.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.confidence - left.confidence;
    });
    const topFinding = sortedFindings[0];
    const chainLinked = sortedFindings.some((finding) =>
      attackChains.some((chain) =>
        chain.steps.some((step) => step.vulnerability === finding.id)
      )
    );
    const priority = this.resolvePriority(
      topFinding?.severity ?? "low",
      chainLinked
    );

    return {
      id: randomUUID(),
      title:
        TITLE_BY_TYPE[type] ??
        `Remediate ${type.replaceAll("_", " ")} weaknesses`,
      priority,
      owner: OWNER_BY_TYPE[type] ?? "application",
      summary: this.uniqueStrings(
        sortedFindings
          .map((finding) => finding.description.trim())
          .filter(Boolean)
      )
        .slice(0, 2)
        .join(" "),
      affectedLocations: this.uniqueStrings(
        sortedFindings.map((finding) => finding.location.trim()).filter(Boolean)
      ).slice(0, 6),
      sourceVulnerabilityIds: sortedFindings.map((finding) => finding.id),
      validationPlan: this.buildValidationPlan(type, sortedFindings)
    };
  }

  private buildValidationPlan(type: string, findings: Vulnerability[]): string {
    const locations = this.uniqueStrings(
      findings.map((finding) => finding.location.trim()).filter(Boolean)
    );
    const topLocation = locations[0] ?? "the validated target surface";

    switch (type) {
      case "authentication":
        return `Repeat the same authorized read-only validation against ${topLocation} and confirm anonymous requests no longer reach protected content.`;
      case "authorization":
        return `Re-run the same approved profile comparison against ${topLocation} and confirm lower-trust identities lose privileged responses.`;
      case "api_security":
        return `Repeat the same safe discovery probes against ${topLocation} and verify sensitive API surface is no longer publicly exposed.`;
      case "session_management":
        return `Repeat the same bounded session checks and confirm hardened cookie, cache, and session handling behavior.`;
      default:
        return `Re-run the same bounded, read-only validation set against ${topLocation} and confirm the previously validated signal is no longer present.`;
    }
  }

  private resolvePriority(
    severity: Vulnerability["severity"],
    chainLinked: boolean
  ): PenetrationTestRemediationPriority {
    if (severity === "critical") {
      return "immediate";
    }

    if (severity === "high") {
      return chainLinked ? "immediate" : "high";
    }

    if (severity === "medium") {
      return chainLinked ? "high" : "medium";
    }

    return chainLinked ? "medium" : "hardening";
  }

  private uniqueStrings(values: string[]): string[] {
    const unique = new Map<string, string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const key = trimmed.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, trimmed);
      }
    }

    return Array.from(unique.values());
  }

  private compareSeverity(
    left: Vulnerability["severity"],
    right: Vulnerability["severity"]
  ): number {
    const rank: Record<Vulnerability["severity"], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3
    };

    return rank[left] - rank[right];
  }

  private comparePriority(
    left: PenetrationTestRemediationPriority,
    right: PenetrationTestRemediationPriority
  ): number {
    const rank: Record<PenetrationTestRemediationPriority, number> = {
      immediate: 0,
      high: 1,
      medium: 2,
      hardening: 3
    };

    return rank[left] - rank[right];
  }
}
