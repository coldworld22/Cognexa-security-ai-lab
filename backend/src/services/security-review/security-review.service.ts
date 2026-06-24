import { z } from "zod";

import { AccessContext } from "../../authorization/authorization.types";
import { AuthorizationService } from "../authorization/authorization.service";
import { LLMService } from "../llm/llm.service";
import {
  WebsiteFindingCategory,
  WebsiteScanFinding,
  WebsiteScanRequest,
  WebsiteScanResult,
  WebsiteScannerService
} from "../website-scanner/website-scanner.service";

export type SecurityReviewCheckCategory = WebsiteFindingCategory;
export type SecurityReviewCheckStatus = "pass" | "warn" | "fail" | "info";
export type SecurityReviewFindingSeverity = "low" | "medium" | "high";
export type SecurityReviewAttackerEffort = "low" | "medium" | "high";
export type SecurityReviewConfidence = "low" | "medium" | "high";
export type SecurityReviewPriority = "immediate" | "next" | "hardening";

export interface SecurityReviewRequest extends WebsiteScanRequest {}

export interface SecurityReviewCheck {
  id: string;
  category: SecurityReviewCheckCategory;
  status: SecurityReviewCheckStatus;
  name: string;
  expectation: string;
  observed: string;
  evidence: string[];
}

export interface SecurityReviewFinding {
  id: string;
  severity: SecurityReviewFindingSeverity;
  category: SecurityReviewCheckCategory;
  title: string;
  summary: string;
  impact: string;
  attackerEffort: SecurityReviewAttackerEffort;
  confidence: SecurityReviewConfidence;
  priority: SecurityReviewPriority;
  attackerView: string;
  attackerPrerequisites: string[];
  remediation: string;
  fixExample: string;
  safeVerification: string;
  pageUrl?: string;
  evidence: string[];
  checkIds: string[];
}

export interface SecurityReviewAttackPath {
  id: string;
  title: string;
  status: "blocked" | "constrained" | "exposed";
  attackerGoal: string;
  attackerEffort: SecurityReviewAttackerEffort;
  narrative: string;
  blockers: string[];
  example: string;
  nextAction: string;
  supportingCheckIds: string[];
}

export interface SecurityReviewAiDecision {
  title: string;
  priority: SecurityReviewPriority;
  rationale: string;
  safeAction: string;
}

export interface SecurityReviewAiAnalysis {
  status: "ready" | "unavailable";
  provider?: string;
  model?: string;
  headline?: string;
  analystPerspective?: string;
  decisiveVerdict?: string;
  decisions: SecurityReviewAiDecision[];
  retestFocus: string[];
  constraints: string[];
  unavailableReason?: string;
}

export interface SecurityReviewResult {
  reviewedAt: string;
  target: {
    requestedUrl: string;
    finalUrl: string;
    hostname: string;
    pagesScanned: number;
    maxPages: number;
  };
  posture: {
    securityScore: number;
    grade: WebsiteScanResult["grade"];
    analysisMode: WebsiteScanResult["analysis"]["mode"];
    browserEngine: string | null;
  };
  summary: {
    riskLevel: WebsiteScanResult["summary"]["riskLevel"];
    headline: string;
    strengths: string[];
    topRisks: string[];
    recommendedActions: string[];
    exposedAttackPaths: number;
    constrainedAttackPaths: number;
    roadmap: {
      immediate: string[];
      next: string[];
      hardening: string[];
    };
  };
  attackPaths: SecurityReviewAttackPath[];
  counts: {
    pass: number;
    warn: number;
    fail: number;
  };
  warnings: string[];
  checks: SecurityReviewCheck[];
  findings: SecurityReviewFinding[];
  aiAnalysis: SecurityReviewAiAnalysis;
}

interface SecurityReviewServiceOptions {
  defaultProvider: string;
  defaultModel: string;
}

export class SecurityReviewService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly websiteScanner: WebsiteScannerService,
    private readonly llm: LLMService,
    private readonly options: SecurityReviewServiceOptions
  ) {}

  async runReview(
    actor: AccessContext,
    input: SecurityReviewRequest
  ): Promise<SecurityReviewResult> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.security-review-lab",
      action: "run_security_review",
      reason: "Security review lab requires 'admin_dashboard' permission"
    });

    const scan = await this.websiteScanner.scanWebsite(actor, input);
    const checks = this.buildChecks(scan);
    const findings = this.buildFindings(scan, checks);
    const attackPaths = this.buildAttackPaths(checks);
    const counts = this.countStatuses(checks);
    const aiAnalysis = await this.buildAiAnalysis(
      actor,
      scan,
      checks,
      findings,
      attackPaths,
      counts
    );

    return {
      reviewedAt: scan.scannedAt,
      target: {
        requestedUrl: scan.requestedUrl,
        finalUrl: scan.finalUrl,
        hostname: scan.hostname,
        pagesScanned: scan.pagesScanned,
        maxPages: scan.maxPages
      },
      posture: {
        securityScore: scan.securityScore,
        grade: scan.grade,
        analysisMode: scan.analysis.mode,
        browserEngine: scan.analysis.browserEngine
      },
      summary: this.buildSummary(scan, findings, attackPaths),
      attackPaths,
      counts,
      warnings: scan.warnings,
      checks,
      findings,
      aiAnalysis
    };
  }

  private buildChecks(scan: WebsiteScanResult): SecurityReviewCheck[] {
    const hasFrameAncestors = (scan.headers.contentSecurityPolicy ?? "")
      .toLowerCase()
      .includes("frame-ancestors");
    const clickjackingProtected = Boolean(
      scan.headers.xFrameOptions || hasFrameAncestors
    );
    const siteUsesHttps = scan.transport.finalProtocol === "https";
    const tlsCertificateTrusted = !siteUsesHttps || scan.transport.certificateTrusted;
    const csp = scan.headers.contentSecurityPolicy;
    const strongCsp = Boolean(csp && !this.isWeakContentSecurityPolicy(csp));
    const exposures = this.readExposureSummary(scan);
    const exposureCount =
      exposures.publicApiDocs +
      exposures.publicApiEndpoints +
      exposures.publicDatabaseInterfaces +
      exposures.publicInternalServices +
      exposures.sensitiveFiles;
    const docsOnlyExposure =
      exposureCount > 0 && exposureCount === exposures.publicApiDocs;
    const fingerprintSummary = scan.fingerprints
      .slice(0, 3)
      .map((fingerprint) => `${fingerprint.source}: ${fingerprint.sanitizedValue}`)
      .join(" | ");

    return [
      {
        id: "transport-https",
        category: "transport",
        status: siteUsesHttps ? "pass" : "fail",
        name: "Public entry point stays on HTTPS",
        expectation:
          "The attacker-facing website entry point should terminate on HTTPS instead of plain HTTP.",
        observed: siteUsesHttps
          ? `The review ended on HTTPS at ${scan.finalUrl}.`
          : `The review ended on plain HTTP at ${scan.finalUrl}.`,
        evidence: [
          `requested=${scan.requestedUrl}`,
          `final=${scan.finalUrl}`,
          `redirectedToHttps=${scan.transport.redirectedToHttps}`
        ]
      },
      {
        id: "transport-certificate-trust",
        category: "transport",
        status: !siteUsesHttps ? "info" : tlsCertificateTrusted ? "pass" : "fail",
        name: "HTTPS certificate chain is trusted",
        expectation:
          "Public HTTPS sites should present a certificate chain that browsers can validate without warning.",
        observed: !siteUsesHttps
          ? "The reviewed entry point did not terminate on HTTPS, so certificate trust is not applicable."
          : tlsCertificateTrusted
            ? "The reviewed HTTPS entry point presented a certificate chain the scanner could validate."
            : "The reviewed HTTPS entry point required the browser-assisted crawl to bypass a certificate warning because the TLS chain was not trusted.",
        evidence: [`certificateTrusted=${scan.transport.certificateTrusted}`]
      },
      {
        id: "transport-hsts",
        category: "transport",
        status: !siteUsesHttps ? "fail" : scan.transport.hstsEnabled ? "pass" : "warn",
        name: "HTTPS transport is pinned with HSTS",
        expectation:
          "HTTPS sites should advertise HSTS so browsers do not fall back to HTTP after the first visit.",
        observed: !siteUsesHttps
          ? "The sampled surface stayed on HTTP, so HSTS is not protecting the entry flow."
          : scan.transport.hstsEnabled
            ? "Strict-Transport-Security was present on the reviewed entry point."
            : "The reviewed HTTPS entry point did not advertise Strict-Transport-Security.",
        evidence: [`hstsEnabled=${scan.transport.hstsEnabled}`]
      },
      {
        id: "headers-csp",
        category: "headers",
        status: !csp ? "fail" : strongCsp ? "pass" : "warn",
        name: "Browser script execution is constrained with CSP",
        expectation:
          "The public surface should ship a restrictive Content-Security-Policy instead of relying on default browser behavior.",
        observed: !csp
          ? "No Content-Security-Policy header was observed on the reviewed entry point."
          : strongCsp
            ? "A non-trivial Content-Security-Policy was present on the reviewed entry point."
            : "The current Content-Security-Policy was present but still allows broad or unsafe sources.",
        evidence: csp ? [this.redactPolicy(csp)] : [scan.finalUrl]
      },
      {
        id: "headers-clickjacking",
        category: "headers",
        status: clickjackingProtected
          ? "pass"
          : scan.surface.loginForms > 0 || scan.surface.totalForms > 0
            ? "fail"
            : "warn",
        name: "Frame embedding is constrained",
        expectation:
          "The public surface should prevent hostile framing with X-Frame-Options or CSP frame-ancestors.",
        observed: clickjackingProtected
          ? "Embedding protections were present on the reviewed entry point."
          : "Neither X-Frame-Options nor CSP frame-ancestors was observed on the reviewed entry point.",
        evidence: [
          `xFrameOptions=${scan.headers.xFrameOptions ?? "absent"}`,
          `frameAncestors=${hasFrameAncestors}`
        ]
      },
      {
        id: "headers-nosniff",
        category: "headers",
        status:
          (scan.headers.xContentTypeOptions ?? "").toLowerCase() === "nosniff"
            ? "pass"
            : "warn",
        name: "MIME sniffing is disabled",
        expectation:
          "The public surface should return X-Content-Type-Options: nosniff on HTML and assets.",
        observed:
          (scan.headers.xContentTypeOptions ?? "").toLowerCase() === "nosniff"
            ? "The entry point returned X-Content-Type-Options: nosniff."
            : "The entry point did not return X-Content-Type-Options: nosniff.",
        evidence: [
          `x-content-type-options=${scan.headers.xContentTypeOptions ?? "absent"}`
        ]
      },
      {
        id: "headers-referrer-policy",
        category: "headers",
        status: scan.headers.referrerPolicy ? "pass" : "warn",
        name: "Referrer leakage is scoped deliberately",
        expectation:
          "The public surface should define a Referrer-Policy instead of inheriting browser defaults.",
        observed: scan.headers.referrerPolicy
          ? `Referrer-Policy was set to ${scan.headers.referrerPolicy}.`
          : "No Referrer-Policy header was observed on the reviewed entry point.",
        evidence: [`referrer-policy=${scan.headers.referrerPolicy ?? "absent"}`]
      },
      {
        id: "headers-permissions-policy",
        category: "headers",
        status: scan.headers.permissionsPolicy ? "pass" : "warn",
        name: "Browser feature access is intentionally narrowed",
        expectation:
          "Public pages should define a Permissions-Policy so powerful browser features are only available when needed.",
        observed: scan.headers.permissionsPolicy
          ? `Permissions-Policy was set to ${scan.headers.permissionsPolicy}.`
          : "No Permissions-Policy header was observed on the reviewed entry point.",
        evidence: [`permissions-policy=${scan.headers.permissionsPolicy ?? "absent"}`]
      },
      {
        id: "headers-coop",
        category: "headers",
        status: scan.headers.crossOriginOpenerPolicy ? "pass" : "info",
        name: "Cross-window isolation is declared deliberately",
        expectation:
          "Sensitive public flows should consider Cross-Origin-Opener-Policy when popup or window-boundary isolation matters.",
        observed: scan.headers.crossOriginOpenerPolicy
          ? `Cross-Origin-Opener-Policy was set to ${scan.headers.crossOriginOpenerPolicy}.`
          : "No Cross-Origin-Opener-Policy header was observed on the reviewed entry point.",
        evidence: [
          `cross-origin-opener-policy=${scan.headers.crossOriginOpenerPolicy ?? "absent"}`
        ]
      },
      {
        id: "cors-origin-policy",
        category: "cors",
        status:
          scan.headers.accessControlAllowOrigin === "*" &&
          (scan.headers.accessControlAllowCredentials ?? "").toLowerCase() === "true"
            ? "fail"
            : scan.headers.accessControlAllowOrigin === "*"
              ? "warn"
              : "pass",
        name: "Cross-origin browser trust is constrained",
        expectation:
          "The public surface should not expose a wildcard CORS policy that broadens browser-readable access.",
        observed:
          scan.headers.accessControlAllowOrigin === "*" &&
          (scan.headers.accessControlAllowCredentials ?? "").toLowerCase() === "true"
            ? "The reviewed entry point returned wildcard CORS together with credential support."
            : scan.headers.accessControlAllowOrigin === "*"
              ? "The reviewed entry point returned wildcard CORS."
              : `The reviewed entry point exposed access-control-allow-origin=${scan.headers.accessControlAllowOrigin ?? "absent"}.`,
        evidence: [
          `access-control-allow-origin=${scan.headers.accessControlAllowOrigin ?? "absent"}`,
          `access-control-allow-credentials=${scan.headers.accessControlAllowCredentials ?? "absent"}`
        ]
      },
      {
        id: "cookies-flag-hygiene",
        category: "cookies",
        status:
          scan.cookies.total === 0
            ? "info"
            : scan.cookies.missingSecure > 0
              ? "fail"
              : scan.cookies.missingHttpOnly > 0 || scan.cookies.missingSameSite > 0
                ? "warn"
                : "pass",
        name: "Observed cookies use defensive browser flags",
        expectation:
          "Session-bearing cookies should be Secure, HttpOnly, and explicitly scoped with SameSite.",
        observed:
          scan.cookies.total === 0
            ? "No response cookies were observed during this review window."
            : `Observed ${scan.cookies.total} cookie(s); missing Secure=${scan.cookies.missingSecure}, HttpOnly=${scan.cookies.missingHttpOnly}, SameSite=${scan.cookies.missingSameSite}.`,
        evidence: [
          `cookieTotal=${scan.cookies.total}`,
          `missingSecure=${scan.cookies.missingSecure}`,
          `missingHttpOnly=${scan.cookies.missingHttpOnly}`,
          `missingSameSite=${scan.cookies.missingSameSite}`
        ]
      },
      {
        id: "forms-credential-transport",
        category: "forms",
        status:
          scan.surface.insecurePasswordSubmissions > 0 ? "fail" : "pass",
        name: "Credential forms stay on encrypted transport",
        expectation:
          "Password-bearing forms should be served and submitted only over HTTPS.",
        observed:
          scan.surface.insecurePasswordSubmissions > 0
            ? `Observed ${scan.surface.insecurePasswordSubmissions} insecure password form(s) in the crawl window.`
            : "No insecure password submissions were observed in the crawl window.",
        evidence: [
          `loginForms=${scan.surface.loginForms}`,
          `insecurePasswordSubmissions=${scan.surface.insecurePasswordSubmissions}`
        ]
      },
      {
        id: "forms-external-actions",
        category: "forms",
        status: scan.surface.externalFormActions > 0 ? "warn" : "pass",
        name: "Form submissions stay inside the intended origin boundary",
        expectation:
          "Sensitive public forms should usually submit to the same origin unless an external trust boundary is intentional.",
        observed:
          scan.surface.externalFormActions > 0
            ? `Observed ${scan.surface.externalFormActions} form action(s) that post to another origin.`
            : "No external form actions were observed in the crawl window.",
        evidence: [`externalFormActions=${scan.surface.externalFormActions}`]
      },
      {
        id: "content-mixed-content",
        category: "content",
        status: scan.surface.mixedContentReferences > 0 ? "fail" : "pass",
        name: "HTTPS pages avoid mixed-content references",
        expectation:
          "HTTPS pages should not embed HTTP assets, form actions, or links that weaken transport integrity.",
        observed:
          scan.surface.mixedContentReferences > 0
            ? `Observed ${scan.surface.mixedContentReferences} mixed-content reference(s) in the crawl window.`
            : "No mixed-content references were observed in the crawl window.",
        evidence: [`mixedContentReferences=${scan.surface.mixedContentReferences}`]
      },
      {
        id: "content-fingerprints",
        category: "content",
        status: scan.fingerprints.length === 0 ? "pass" : "warn",
        name: "Public stack fingerprinting is minimized",
        expectation:
          "Public pages and headers should avoid exposing implementation or version hints that simplify reconnaissance.",
        observed:
          scan.fingerprints.length === 0
            ? "No stack fingerprints were observed in sampled headers or metadata."
            : `Observed ${scan.fingerprints.length} fingerprint hint(s) across headers or metadata.`,
        evidence:
          scan.fingerprints.length === 0
            ? [scan.finalUrl]
            : [fingerprintSummary]
      },
      {
        id: "content-directory-listing",
        category: "content",
        status: scan.surface.directoryListings > 0 ? "fail" : "pass",
        name: "Directory indexes are not exposed",
        expectation:
          "Public routes should not reveal raw directory listings or unintended file indexes.",
        observed:
          scan.surface.directoryListings > 0
            ? `Observed ${scan.surface.directoryListings} directory-listing response(s) in the crawl window.`
            : "No directory listings were observed in the crawl window.",
        evidence: [`directoryListings=${scan.surface.directoryListings}`]
      },
      {
        id: "content-third-party-scripts",
        category: "content",
        status: scan.surface.thirdPartyScripts > 0 ? "warn" : "pass",
        name: "Third-party client-side trust remains tight",
        expectation:
          "Public pages should keep third-party JavaScript to the minimum needed for business use.",
        observed:
          scan.surface.thirdPartyScripts > 0
            ? `Observed ${scan.surface.thirdPartyScripts} third-party script(s) in the crawl window.`
            : "No third-party script loads were observed in the crawl window.",
        evidence: [`thirdPartyScripts=${scan.surface.thirdPartyScripts}`]
      },
      {
        id: "exposure-public-services",
        category: "exposure",
        status:
          exposures.probedEndpoints === 0
            ? "info"
            : exposureCount === 0
              ? "pass"
              : docsOnlyExposure
                ? "warn"
                : "fail",
        name: "Sensitive API, database, and management surfaces stay private",
        expectation:
          "Public websites should not expose sensitive API responses, management routes, database interfaces, or config files anonymously.",
        observed:
          exposures.probedEndpoints === 0
            ? "API and service exposure probes were skipped because the public entry response could not be inspected deeply enough."
            : exposureCount === 0
              ? `Passive probes checked ${exposures.probedEndpoints} candidate endpoint(s) and did not confirm a public API, database, or management exposure.`
              : `Passive probes checked ${exposures.probedEndpoints} candidate endpoint(s) and confirmed apiDocs=${exposures.publicApiDocs}, apiEndpoints=${exposures.publicApiEndpoints}, databaseInterfaces=${exposures.publicDatabaseInterfaces}, internalServices=${exposures.publicInternalServices}, sensitiveFiles=${exposures.sensitiveFiles}.`,
        evidence: [
          `probedEndpoints=${exposures.probedEndpoints}`,
          `publicApiDocs=${exposures.publicApiDocs}`,
          `publicApiEndpoints=${exposures.publicApiEndpoints}`,
          `publicDatabaseInterfaces=${exposures.publicDatabaseInterfaces}`,
          `publicInternalServices=${exposures.publicInternalServices}`,
          `sensitiveFiles=${exposures.sensitiveFiles}`
        ]
      }
    ];
  }

  private buildFindings(
    scan: WebsiteScanResult,
    checks: SecurityReviewCheck[]
  ): SecurityReviewFinding[] {
    const findings = scan.findings
      .filter(
        (finding): finding is WebsiteScanFinding & { severity: SecurityReviewFindingSeverity } =>
          finding.severity !== "info"
      )
      .map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        summary: finding.summary,
        impact: this.describeImpact(finding),
        attackerEffort: this.describeAttackerEffort(finding),
        confidence: this.describeConfidence(scan, finding),
        priority: this.describePriority(finding),
        attackerView: this.describeAttackerView(finding),
        attackerPrerequisites: this.describeAttackerPrerequisites(finding),
        remediation: finding.remediation,
        fixExample: this.describeFixExample(finding),
        safeVerification: this.describeSafeVerification(finding),
        pageUrl: finding.pageUrl,
        evidence: finding.evidence,
        checkIds: this.mapFindingCheckIds(finding, checks)
      }));

    return findings.sort((left, right) => {
      const priorityDelta =
        this.priorityRank(left.priority) - this.priorityRank(right.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return this.severityRank(right.severity) - this.severityRank(left.severity);
    });
  }

  private buildAttackPaths(
    checks: SecurityReviewCheck[]
  ): SecurityReviewAttackPath[] {
    const clickjackingStatus = this.readCheckStatus(checks, "headers-clickjacking");
    const sessionStatus = this.combineAttackPathStatuses(
      this.readCheckStatus(checks, "transport-https"),
      this.readCheckStatus(checks, "transport-certificate-trust"),
      this.readCheckStatus(checks, "transport-hsts"),
      this.readCheckStatus(checks, "cookies-flag-hygiene"),
      this.readCheckStatus(checks, "forms-credential-transport"),
      this.readCheckStatus(checks, "content-mixed-content")
    );
    const browserInjectionStatus = this.combineAttackPathStatuses(
      this.readCheckStatus(checks, "headers-csp"),
      this.readCheckStatus(checks, "content-third-party-scripts"),
      this.readCheckStatus(checks, "content-mixed-content")
    );
    const reconStatus = this.combineAttackPathStatuses(
      this.readCheckStatus(checks, "content-fingerprints"),
      this.readCheckStatus(checks, "content-directory-listing")
    );
    const serviceExposureStatus = this.readCheckStatus(
      checks,
      "exposure-public-services"
    );
    const crossOriginStatus = this.combineAttackPathStatuses(
      this.readCheckStatus(checks, "cors-origin-policy"),
      this.readCheckStatus(checks, "forms-external-actions"),
      this.readCheckStatus(checks, "cookies-flag-hygiene")
    );
    const browserBoundaryStatus = this.combineAttackPathStatuses(
      this.readCheckStatus(checks, "headers-permissions-policy"),
      this.readCheckStatus(checks, "headers-nosniff"),
      this.readCheckStatus(checks, "content-third-party-scripts")
    );

    return [
      {
        id: "attack-path-clickjacking",
        title: "Frame-and-click deception",
        status: this.toAttackPathStatus(clickjackingStatus),
        attackerGoal:
          "Place a trusted page inside hostile chrome and trick a real user into clicking the wrong interface.",
        attackerEffort: this.attackPathEffort(this.toAttackPathStatus(clickjackingStatus)),
        narrative:
          clickjackingStatus === "pass"
            ? "The reviewed surface exposed frame protections that make hostile framing materially harder."
            : clickjackingStatus === "warn"
              ? "The reviewed surface did not fully prove hostile framing resistance across the sampled entry flow."
              : "A hostile site could potentially frame the public page and rely on visual deception against real users.",
        blockers:
          clickjackingStatus === "pass"
            ? ["Frame embedding was constrained by X-Frame-Options or CSP frame-ancestors."]
            : [],
        example:
          "Example: a fake promotion page loads the real site in a hidden frame and tricks a user into clicking where a sensitive button sits underneath.",
        nextAction:
          "Apply X-Frame-Options or frame-ancestors consistently on sensitive pages, especially any login or transactional flow.",
        supportingCheckIds: ["headers-clickjacking"]
      },
      {
        id: "attack-path-session-interception",
        title: "Session or credential interception on the wire",
        status: sessionStatus,
        attackerGoal:
          "Capture, replay, or tamper with browser traffic or session material during transport.",
        attackerEffort: this.attackPathEffort(sessionStatus),
        narrative:
          sessionStatus === "blocked"
            ? "The sampled entry flow stayed on HTTPS without obvious mixed-content or insecure credential submission paths."
            : sessionStatus === "constrained"
              ? "Core browser transport controls are present, but at least one weakening gap remains in the sampled path."
              : "The sampled public surface leaves a practical opening for downgrade, interception, or cookie leakage scenarios.",
        blockers:
          sessionStatus === "blocked"
            ? ["HTTPS, cookie handling, and credential transport looked aligned in the sampled crawl window."]
            : [],
        example:
          "Example: an attacker on shared Wi-Fi watches for HTTP pages, insecure login posts, or cookies that are still allowed off HTTPS.",
        nextAction:
          "Keep login and session flows HTTPS-only, add HSTS, and require Secure or HttpOnly cookie handling where applicable.",
        supportingCheckIds: [
          "transport-https",
          "transport-certificate-trust",
          "transport-hsts",
          "cookies-flag-hygiene",
          "forms-credential-transport",
          "content-mixed-content"
        ]
      },
      {
        id: "attack-path-browser-injection",
        title: "Browser-side code execution expansion",
        status: browserInjectionStatus,
        attackerGoal:
          "Turn any later injection point or supplier compromise into script execution inside trusted user sessions.",
        attackerEffort: this.attackPathEffort(browserInjectionStatus),
        narrative:
          browserInjectionStatus === "blocked"
            ? "The sampled client-side surface did not show an immediate browser-hardening gap that obviously enlarges script execution trust."
            : browserInjectionStatus === "constrained"
              ? "Client-side trust is partially bounded, but weak CSP or third-party script reliance still widens the blast radius."
              : "The sampled client-side surface leaves room for hostile code execution impact if any injection or supplier compromise occurs.",
        blockers:
          browserInjectionStatus === "blocked"
            ? ["The reviewed entry flow avoided the clearest browser-side trust expansion signals in this scan window."]
            : [],
        example:
          "Example: if an unrelated injection bug or compromised script supplier appears later, a weak policy makes it easier for that code to run inside real user sessions.",
        nextAction:
          "Tighten CSP, reduce third-party script trust, and eliminate mixed-content references on HTTPS pages.",
        supportingCheckIds: [
          "headers-csp",
          "content-third-party-scripts",
          "content-mixed-content"
        ]
      },
      {
        id: "attack-path-recon",
        title: "Reconnaissance through public hints",
        status: reconStatus,
        attackerGoal:
          "Collect enough public detail to focus later probing on the most likely weak parts of the stack.",
        attackerEffort: this.attackPathEffort(reconStatus),
        narrative:
          reconStatus === "blocked"
            ? "The sampled public surface kept stack hints and directory exposure relatively quiet."
            : reconStatus === "constrained"
              ? "Some reconnaissance hints were still exposed, but not the most direct file-listing style disclosure."
              : "The sampled public surface exposed details that help an attacker narrow technologies, files, or likely weak points faster.",
        blockers:
          reconStatus === "blocked"
            ? ["No directory listing or obvious version-bearing fingerprint stood out in the sampled public responses."]
            : [],
        example:
          "Example: a casual attacker collects framework, server, or file naming hints first, then tailors later probes around the observed stack.",
        nextAction:
          "Trim public fingerprint headers, sanitize generator metadata, and disable directory indexes at the edge.",
        supportingCheckIds: ["content-fingerprints", "content-directory-listing"]
      },
      {
        id: "attack-path-service-exposure",
        title: "Direct service and data exposure",
        status: this.toAttackPathStatus(serviceExposureStatus),
        attackerGoal:
          "Pull sensitive data or operational detail directly from public APIs, management routes, admin panels, or leaked config files.",
        attackerEffort: this.attackPathEffort(
          this.toAttackPathStatus(serviceExposureStatus)
        ),
        narrative:
          this.toAttackPathStatus(serviceExposureStatus) === "blocked"
            ? "Passive probes did not confirm a public API, admin, or diagnostics surface that directly exposed internal data in this review window."
            : this.toAttackPathStatus(serviceExposureStatus) === "constrained"
              ? "Some developer-facing API surface is still reachable publicly, which makes route discovery and later targeting easier even without confirmed data leakage."
              : "The reviewed origin exposed API, management, database, or configuration surfaces that materially shorten the path from recon to sensitive data or operational insight.",
        blockers:
          this.toAttackPathStatus(serviceExposureStatus) === "blocked"
            ? [
                "The passive probe set did not confirm an anonymously reachable API, database admin panel, management route, or leaked config file."
              ]
            : [],
        example:
          "Example: an attacker loads a public OpenAPI description, health endpoint, database admin panel, or leaked config file and uses that material to focus the next move quickly.",
        nextAction:
          "Keep API docs, admin panels, management routes, and configuration files behind authentication or private network boundaries.",
        supportingCheckIds: ["exposure-public-services"]
      },
      {
        id: "attack-path-cross-origin-trust",
        title: "Cross-origin trust abuse",
        status: crossOriginStatus,
        attackerGoal:
          "Use a victim browser to cross trust boundaries the application meant to keep narrow.",
        attackerEffort: this.attackPathEffort(crossOriginStatus),
        narrative:
          crossOriginStatus === "blocked"
            ? "The sampled public surface did not show an obvious wildcard browser trust boundary across origins."
            : crossOriginStatus === "constrained"
              ? "Cross-origin trust was not fully broken open, but form routing or cookie posture still broadens the trust boundary."
              : "The sampled public surface leaves a material cross-origin trust gap that expands what another site could attempt in a victim browser.",
        blockers:
          crossOriginStatus === "blocked"
            ? ["The sampled entry flow kept cross-origin browser trust reasonably narrow."]
            : [],
        example:
          "Example: a hostile site looks for wildcard CORS, cross-origin form posts, or weak cookie scoping so browser requests cross trust boundaries more freely.",
        nextAction:
          "Use explicit origin allowlists, keep sensitive form submissions same-origin where possible, and set SameSite deliberately on cookies.",
        supportingCheckIds: [
          "cors-origin-policy",
          "forms-external-actions",
          "cookies-flag-hygiene"
        ]
      },
      {
        id: "attack-path-browser-boundaries",
        title: "Browser boundary and feature abuse",
        status: browserBoundaryStatus,
        attackerGoal:
          "Take advantage of overly broad browser feature exposure or loose page boundaries once script or supplier trust is gained.",
        attackerEffort: this.attackPathEffort(browserBoundaryStatus),
        narrative:
          browserBoundaryStatus === "blocked"
            ? "The sampled surface kept browser feature exposure and page boundary hardening reasonably tight in this review window."
            : browserBoundaryStatus === "constrained"
              ? "Some browser-side hardening exists, but missing feature scoping or supplier trust still leaves room to widen impact."
              : "The sampled surface leaves browser capabilities and page boundaries broader than needed, which increases the blast radius of any later client-side compromise.",
        blockers:
          browserBoundaryStatus === "blocked"
            ? ["Permissions, MIME handling, and supplier trust looked reasonably constrained in the sampled pages."]
            : [],
        example:
          "Example: a later script compromise lands inside a page that still exposes more browser features or looser window boundaries than the business flow actually needs.",
        nextAction:
          "Define Permissions-Policy, keep MIME handling strict, minimize third-party JavaScript, and add COOP where the product flow supports it.",
        supportingCheckIds: [
          "headers-permissions-policy",
          "headers-coop",
          "headers-nosniff",
          "content-third-party-scripts"
        ]
      }
    ];
  }

  private buildSummary(
    scan: WebsiteScanResult,
    findings: SecurityReviewFinding[],
    attackPaths: SecurityReviewAttackPath[]
  ): SecurityReviewResult["summary"] {
    const exposedPaths = attackPaths.filter((path) => path.status === "exposed").length;
    const constrainedPaths = attackPaths.filter(
      (path) => path.status === "constrained"
    ).length;
    const topRisks = findings.slice(0, 3).map((finding) => finding.title);
    const roadmap = this.buildRoadmap(findings);

    return {
      riskLevel: scan.summary.riskLevel,
      headline:
        findings.length === 0
          ? `The attacker-minded passive review covered ${scan.pagesScanned} page(s) and did not surface a material browser-facing weakness in the sampled public surface.`
          : `The attacker-minded passive review covered ${scan.pagesScanned} page(s) and found ${findings.length} issue(s), leaving ${exposedPaths} modeled attack path(s) exposed and ${constrainedPaths} more only partially constrained.`,
      strengths: scan.summary.strengths.slice(0, 5),
      topRisks,
      recommendedActions: scan.summary.recommendedActions.slice(0, 5),
      exposedAttackPaths: exposedPaths,
      constrainedAttackPaths: constrainedPaths,
      roadmap
    };
  }

  private async buildAiAnalysis(
    actor: AccessContext,
    scan: WebsiteScanResult,
    checks: SecurityReviewCheck[],
    findings: SecurityReviewFinding[],
    attackPaths: SecurityReviewAttackPath[],
    counts: SecurityReviewResult["counts"]
  ): Promise<SecurityReviewAiAnalysis> {
    const providerSelection = await this.selectAiProviderAndModel().catch(() => null);
    if (!providerSelection) {
      return {
        status: "unavailable",
        decisions: [],
        retestFocus: [],
        constraints: ["No installed local completion model is currently available."],
        unavailableReason: "No installed local completion model is available."
      };
    }

    const schema = z.object({
      headline: z.string().min(1).max(260),
      analystPerspective: z.string().min(1).max(420),
      decisiveVerdict: z.string().min(1).max(320),
      decisions: z
        .array(
          z.object({
            title: z.string().min(1).max(120),
            priority: z.enum(["immediate", "next", "hardening"]),
            rationale: z.string().min(1).max(240),
            safeAction: z.string().min(1).max(220)
          })
        )
        .min(1)
        .max(5),
      retestFocus: z.array(z.string().min(1).max(180)).min(1).max(5),
      constraints: z.array(z.string().min(1).max(180)).max(4).default([])
    });

    const promptPayload = {
      target: {
        requestedUrl: scan.requestedUrl,
        finalUrl: scan.finalUrl,
        hostname: scan.hostname,
        pagesScanned: scan.pagesScanned,
        maxPages: scan.maxPages
      },
      posture: {
        score: scan.securityScore,
        grade: scan.grade,
        riskLevel: scan.summary.riskLevel,
        analysisMode: scan.analysis.mode,
        browserEngine: scan.analysis.browserEngine
      },
      counts,
      warnings: scan.warnings.slice(0, 6),
      findings: findings.slice(0, 8).map((finding) => ({
        title: finding.title,
        severity: finding.severity,
        category: finding.category,
        impact: finding.impact,
        attackerEffort: finding.attackerEffort,
        confidence: finding.confidence,
        priority: finding.priority,
        attackerView: finding.attackerView,
        prerequisites: finding.attackerPrerequisites,
        remediation: finding.remediation,
        safeVerification: finding.safeVerification
      })),
      attackPaths: attackPaths.map((path) => ({
        title: path.title,
        status: path.status,
        attackerGoal: path.attackerGoal,
        attackerEffort: path.attackerEffort,
        nextAction: path.nextAction
      })),
      failedOrWarnedChecks: checks
        .filter((check) => check.status === "fail" || check.status === "warn")
        .slice(0, 10)
        .map((check) => ({
          name: check.name,
          status: check.status,
          observed: check.observed
        })),
      summary: {
        strengths: scan.summary.strengths.slice(0, 5),
        topRisks: scan.summary.topRisks.slice(0, 5),
        recommendedActions: scan.summary.recommendedActions.slice(0, 5)
      }
    };

    try {
      const response = await this.llm.createStructuredOutput(
        providerSelection.provider,
        {
          model: providerSelection.model,
          messages: [
            {
              role: "system",
              content:
                "You are a defensive website security analyst embedded inside a passive white-hat review lab. Think like an experienced attacker only to prioritize defense. Use only the provided passive evidence. Never provide exploit payloads, intrusion steps, bypass guidance, brute force, authentication abuse, or destructive actions. Return concise defensive analysis that ranks what to fix first and what to verify next."
            },
            {
              role: "user",
              content: `Generate an inline AI security analysis from this passive review evidence:\n${JSON.stringify(
                promptPayload
              )}`
            }
          ]
        },
        schema,
        {
          actor,
          action: "admin.security_review.ai_analysis",
          categories: ["vulnerability_analysis"],
          content: "Generate defensive attacker-perspective website security analysis from passive scan evidence.",
          metadata: {
            passiveOnly: true,
            noExploitGuidance: true,
            target: scan.finalUrl
          }
        }
      );

      return {
        status: "ready",
        provider: providerSelection.provider,
        model: providerSelection.model,
        headline: response.headline,
        analystPerspective: response.analystPerspective,
        decisiveVerdict: response.decisiveVerdict,
        decisions: response.decisions,
        retestFocus: response.retestFocus,
        constraints: response.constraints
      };
    } catch (error) {
      return {
        status: "unavailable",
        provider: providerSelection.provider,
        model: providerSelection.model,
        decisions: [],
        retestFocus: [],
        constraints: [
          "The deterministic security review still completed, but AI commentary could not be generated for this run."
        ],
        unavailableReason:
          error instanceof Error ? error.message : "AI commentary was unavailable."
      };
    }
  }

  private async selectAiProviderAndModel(): Promise<{
    provider: string;
    model: string;
  } | null> {
    const providers = await this.llm.listProviders();
    const availableProviders = providers.filter((provider) => provider.models.length > 0);
    if (availableProviders.length === 0) {
      return null;
    }

    const preferredProvider =
      availableProviders.find((provider) => provider.id === this.options.defaultProvider) ??
      availableProviders[0]!;
    const preferredModel =
      preferredProvider.models.find(
        (model) =>
          this.normalizeModelName(model) ===
          this.normalizeModelName(this.options.defaultModel)
      ) ?? preferredProvider.models[0];

    if (!preferredModel) {
      return null;
    }

    return {
      provider: preferredProvider.id,
      model: preferredModel
    };
  }

  private readExposureSummary(scan: WebsiteScanResult) {
    return (
      scan.exposures ?? {
        probedEndpoints: 0,
        publicApiDocs: 0,
        publicApiEndpoints: 0,
        publicDatabaseInterfaces: 0,
        publicInternalServices: 0,
        sensitiveFiles: 0,
        endpoints: []
      }
    );
  }

  private classifyExposureFinding(
    findingId: string
  ):
    | "api_docs"
    | "api_data"
    | "database_interface"
    | "internal_service"
    | "sensitive_file"
    | null {
    if (findingId.startsWith("exposure-api-docs-")) {
      return "api_docs";
    }
    if (findingId.startsWith("exposure-api-data-")) {
      return "api_data";
    }
    if (findingId.startsWith("exposure-database-interface-")) {
      return "database_interface";
    }
    if (findingId.startsWith("exposure-internal-service-")) {
      return "internal_service";
    }
    if (findingId.startsWith("exposure-sensitive-file-")) {
      return "sensitive_file";
    }

    return null;
  }

  private mapFindingCheckIds(
    finding: WebsiteScanFinding,
    checks: SecurityReviewCheck[]
  ): string[] {
    const mappedIds: string[] = [];

    if (
      finding.id === "headers-missing-csp" ||
      finding.id === "headers-weak-csp"
    ) {
      mappedIds.push("headers-csp");
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      mappedIds.push("transport-certificate-trust");
    }

    if (finding.id === "headers-missing-frame-protection") {
      mappedIds.push("headers-clickjacking");
    }

    if (finding.id === "headers-missing-nosniff") {
      mappedIds.push("headers-nosniff");
    }

    if (finding.id === "headers-missing-referrer-policy") {
      mappedIds.push("headers-referrer-policy");
    }

    if (finding.id === "headers-missing-permissions-policy") {
      mappedIds.push("headers-permissions-policy");
    }

    if (finding.id === "headers-missing-coop") {
      mappedIds.push("headers-coop");
    }

    if (finding.id.startsWith("cors-")) {
      mappedIds.push("cors-origin-policy");
    }

    if (finding.id.startsWith("cookies-")) {
      mappedIds.push("cookies-flag-hygiene");
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      mappedIds.push("forms-credential-transport");
    }

    if (finding.id.startsWith("forms-external-action-")) {
      mappedIds.push("forms-external-actions");
    }

    if (finding.id.startsWith("content-mixed-")) {
      mappedIds.push("content-mixed-content");
    }

    if (
      finding.id === "headers-x-powered-by" ||
      finding.id === "headers-server-version" ||
      finding.id === "content-generator-version"
    ) {
      mappedIds.push("content-fingerprints");
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      mappedIds.push("content-directory-listing");
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      mappedIds.push("content-third-party-scripts");
    }

    if (finding.id.startsWith("exposure-")) {
      mappedIds.push("exposure-public-services");
    }

    if (mappedIds.length > 0) {
      return mappedIds;
    }

    return checks
      .filter((check) => check.category === finding.category)
      .map((check) => check.id);
  }

  private describeImpact(finding: WebsiteScanFinding): string {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (exposureKind === "api_docs") {
      return "Public API descriptions and explorers reduce the time an attacker needs to map routes, object models, and privileged workflows.";
    }
    if (exposureKind === "api_data") {
      return "Sensitive account, admin, or internal API data can be retrieved directly from the public edge without first compromising a browser session.";
    }
    if (exposureKind === "database_interface") {
      return "A publicly reachable database or cluster-management surface sharply lowers the barrier to direct data access or administrative misuse.";
    }
    if (exposureKind === "internal_service") {
      return "Operational telemetry, diagnostics, or management data can leak internal architecture, health state, and technology detail to the public internet.";
    }
    if (exposureKind === "sensitive_file") {
      return "Leaked configuration files can disclose secrets, internal hosts, and connection details that accelerate later compromise.";
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return "Real browsers will warn on the public site and users may abandon the flow or click through a connection that cannot be trusted.";
    }

    if (finding.id === "headers-missing-csp" || finding.id === "headers-weak-csp") {
      return "Any later injection bug or supplier compromise would have fewer browser controls limiting what hostile code can do inside user sessions.";
    }

    if (finding.id === "headers-missing-frame-protection") {
      return "A deceptive page can more easily borrow the trusted UI and push users into unintended clicks or approvals.";
    }

    if (finding.id === "headers-missing-nosniff") {
      return "Content-type ambiguity increases the chance a browser interprets a response more dangerously than intended.";
    }

    if (finding.id === "headers-missing-referrer-policy") {
      return "Sensitive path or query detail may be shared with other origins during normal navigation flows.";
    }

    if (finding.id === "headers-missing-permissions-policy") {
      return "The page leaves more browser features available than business logic may actually need.";
    }

    if (finding.id === "cors-wildcard-credentials") {
      return "Authenticated browser responses could become reachable from hostile origins if the application logic also trusts ambient cookies.";
    }

    if (finding.id === "cors-wildcard-origin") {
      return "Cross-origin browser reads are broader than necessary, which expands data exposure to any external site.";
    }

    if (finding.id === "cookies-missing-secure") {
      return "Session-bearing cookies may leak onto plaintext requests or downgraded transport paths.";
    }

    if (finding.id === "cookies-missing-httponly") {
      return "A browser-side compromise can escalate into direct session theft more easily.";
    }

    if (finding.id === "cookies-missing-samesite") {
      return "Cross-site request abuse becomes easier to chain into account or state-changing actions.";
    }

    if (
      finding.id === "headers-x-powered-by" ||
      finding.id === "headers-server-version" ||
      finding.id === "content-generator-version"
    ) {
      return "Public recon becomes cheaper, which shortens the path from broad scanning to stack-specific probing.";
    }

    if (finding.id.startsWith("content-mixed-")) {
      return "A weaker HTTP dependency can undermine an otherwise HTTPS page and its trusted rendering path.";
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      return "Credentials can be observed or modified before they reach the legitimate endpoint.";
    }

    if (finding.id.startsWith("forms-external-action-")) {
      return "Sensitive user input leaves the current origin boundary and inherits another service's security posture.";
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      return "A third-party supplier compromise would execute inside this page's trust boundary with the same browser privileges as first-party code.";
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      return "Directory structure, forgotten assets, or backup artifacts may become directly enumerable.";
    }

    return "The sampled issue broadens what an external attacker could learn, influence, or reuse through ordinary browser traffic.";
  }

  private describeAttackerEffort(
    finding: WebsiteScanFinding
  ): SecurityReviewAttackerEffort {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (
      exposureKind === "api_data" ||
      exposureKind === "database_interface" ||
      exposureKind === "internal_service" ||
      exposureKind === "sensitive_file"
    ) {
      return "low";
    }
    if (exposureKind === "api_docs") {
      return "medium";
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return "low";
    }

    if (
      finding.id === "cors-wildcard-credentials" ||
      finding.id === "cookies-missing-secure" ||
      finding.id.startsWith("content-directory-listing-") ||
      finding.id.startsWith("forms-insecure-password-") ||
      finding.id.startsWith("content-mixed-")
    ) {
      return "low";
    }

    if (
      finding.id === "headers-missing-frame-protection" ||
      finding.id === "headers-missing-csp" ||
      finding.id === "headers-weak-csp" ||
      finding.id === "cors-wildcard-origin" ||
      finding.id === "cookies-missing-httponly" ||
      finding.id === "cookies-missing-samesite" ||
      finding.id.startsWith("content-third-party-scripts-") ||
      finding.id.startsWith("forms-external-action-")
    ) {
      return "medium";
    }

    return "high";
  }

  private describeConfidence(
    scan: WebsiteScanResult,
    finding: WebsiteScanFinding
  ): SecurityReviewConfidence {
    if (this.classifyExposureFinding(finding.id)) {
      return "high";
    }

    if (
      finding.id.startsWith("content-third-party-scripts-") ||
      finding.id.startsWith("forms-external-action-") ||
      finding.id.startsWith("forms-insecure-password-")
    ) {
      return scan.analysis.mode === "browser" ? "high" : "medium";
    }

    if (
      finding.id.startsWith("content-directory-listing-") ||
      finding.id.startsWith("content-mixed-")
    ) {
      return "high";
    }

    return "high";
  }

  private describePriority(finding: WebsiteScanFinding): SecurityReviewPriority {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (
      exposureKind === "api_data" ||
      exposureKind === "database_interface" ||
      exposureKind === "internal_service" ||
      exposureKind === "sensitive_file"
    ) {
      return finding.severity === "high" ? "immediate" : "next";
    }
    if (exposureKind === "api_docs") {
      return "next";
    }

    if (
      finding.severity === "high" ||
      finding.id === "headers-missing-frame-protection" ||
      finding.id === "headers-missing-csp" ||
      finding.id === "headers-weak-csp" ||
      finding.id.startsWith("content-mixed-") ||
      finding.id.startsWith("forms-insecure-password-")
    ) {
      return "immediate";
    }

    if (
      finding.id === "cors-wildcard-origin" ||
      finding.id.startsWith("forms-external-action-") ||
      finding.id.startsWith("content-directory-listing-") ||
      finding.id.startsWith("content-third-party-scripts-")
    ) {
      return "next";
    }

    return "hardening";
  }

  private describeAttackerView(finding: WebsiteScanFinding): string {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (exposureKind === "api_docs") {
      return "A public API description or explorer reduces discovery time and shows attackers which routes, objects, and auth flows deserve attention next.";
    }
    if (exposureKind === "api_data") {
      return "If the route already returns structured account, admin, or config data publicly, the attacker can skip several setup steps and collect useful material immediately.";
    }
    if (exposureKind === "database_interface") {
      return "A public database or cluster-management interface gives attackers a direct pivot toward records, schemas, or operational controls that should never sit on the internet edge.";
    }
    if (exposureKind === "internal_service") {
      return "Health, metrics, and debug surfaces reveal how the application is built and behaving, which helps attackers narrow later targeting quickly.";
    }
    if (exposureKind === "sensitive_file") {
      return "A leaked environment or config file can hand attackers secrets, internal addresses, or service credentials without needing a separate exploit.";
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return "A broken certificate chain weakens user trust immediately and can make it easier for attackers to take advantage of confusion around certificate warnings or fallback behavior.";
    }

    if (
      finding.id === "headers-missing-csp" ||
      finding.id === "headers-weak-csp"
    ) {
      return "If a separate injection bug exists anywhere in the app, the browser has fewer policy guardrails to stop hostile script from running in a real user session.";
    }

    if (finding.id === "headers-missing-frame-protection") {
      return "A malicious site could place this page in a hidden frame and trick a user into clicking a decoy interface layered over the real one.";
    }

    if (finding.id === "headers-missing-nosniff") {
      return "Browsers have more room to guess content types when the response does not explicitly disable MIME sniffing.";
    }

    if (finding.id === "headers-missing-referrer-policy") {
      return "Cross-site navigations can leak more path or query detail than intended when referrer behavior is left implicit.";
    }

    if (finding.id === "headers-missing-permissions-policy") {
      return "Browser features remain more open by default unless the site explicitly narrows what is available.";
    }

    if (finding.id === "cors-wildcard-credentials") {
      return "A hostile origin would look for ways to make a victim browser expose authenticated responses across origins when trust is this broad.";
    }

    if (finding.id === "cors-wildcard-origin") {
      return "Any site can call into resources protected only by a wildcard CORS policy, which expands what the browser will share.";
    }

    if (finding.id === "cookies-missing-secure") {
      return "A downgraded HTTP request or hostile network path could receive cookies that should stay confined to HTTPS.";
    }

    if (finding.id === "cookies-missing-httponly") {
      return "If client-side script is compromised, readable cookies are easier to steal or reuse.";
    }

    if (finding.id === "cookies-missing-samesite") {
      return "Cross-site requests face weaker browser-side resistance when SameSite behavior is left undefined.";
    }

    if (
      finding.id === "headers-x-powered-by" ||
      finding.id === "headers-server-version" ||
      finding.id === "content-generator-version"
    ) {
      return "Version or framework clues reduce reconnaissance time and help attackers focus later probing on a narrower stack profile.";
    }

    if (finding.id.startsWith("content-mixed-")) {
      return "An attacker controlling any HTTP asset path or network hop could tamper with the insecure subresource before the page renders it.";
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      return "Credentials submitted from this form can be observed or altered anywhere between the browser and the endpoint.";
    }

    if (finding.id.startsWith("forms-external-action-")) {
      return "User input leaves the current origin, so compromise or logging on the other origin becomes part of this form's trust boundary too.";
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      return "Compromise of the external script supplier would execute code inside this page's trust boundary.";
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      return "A casual attacker can enumerate file names, backups, and path structure that were likely never meant to be browsed directly.";
    }

    return "The sampled issue widens what an external attacker can observe, tamper with, or abuse through a normal browser path.";
  }

  private describeAttackerPrerequisites(finding: WebsiteScanFinding): string[] {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (exposureKind === "api_docs") {
      return [
        "The API description or explorer is reachable anonymously from the public origin.",
        "An attacker can browse the documentation or schema without an authenticated session."
      ];
    }
    if (exposureKind === "api_data") {
      return [
        "A sensitive-looking API route responds from the public origin without a login challenge.",
        "The response includes structured account, admin, internal, or configuration data."
      ];
    }
    if (exposureKind === "database_interface") {
      return [
        "A database admin or cluster-management route is reachable from the public internet.",
        "No stronger network boundary prevents direct browser or HTTP access."
      ];
    }
    if (exposureKind === "internal_service") {
      return [
        "A health, metrics, debug, or management route is exposed on the public origin.",
        "The response reveals internal operational detail that should usually stay private."
      ];
    }
    if (exposureKind === "sensitive_file") {
      return [
        "A config or environment file is directly reachable from the public web root.",
        "The file contains internal hosts, secrets, or service connection detail."
      ];
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return [
        "The public hostname presents an incomplete, mismatched, expired, or otherwise untrusted certificate chain.",
        "A victim reaches the affected HTTPS entry point in a normal browser."
      ];
    }

    if (finding.id === "headers-missing-csp" || finding.id === "headers-weak-csp") {
      return [
        "A separate injection bug or compromised allowed script source exists somewhere in the page flow.",
        "A victim loads the affected page in a standard browser session."
      ];
    }

    if (finding.id === "headers-missing-frame-protection") {
      return [
        "A victim visits an attacker-controlled page.",
        "The sensitive page can be loaded inside a browser frame."
      ];
    }

    if (finding.id === "headers-missing-nosniff") {
      return [
        "A browser receives an ambiguously typed response.",
        "An attacker can influence a referenced asset or response path."
      ];
    }

    if (finding.id === "headers-missing-referrer-policy") {
      return [
        "Users navigate away from the site or load cross-origin content.",
        "Sensitive detail appears in the URL path or query string."
      ];
    }

    if (finding.id === "headers-missing-permissions-policy") {
      return [
        "A third-party or injected script gains execution inside the page.",
        "A browser feature remains enabled by default."
      ];
    }

    if (finding.id === "cors-wildcard-credentials") {
      return [
        "The victim browser is already authenticated to the target.",
        "A browser-callable endpoint uses the permissive CORS response."
      ];
    }

    if (finding.id === "cors-wildcard-origin") {
      return [
        "A hostile site can trigger requests from a visitor browser.",
        "The endpoint returns data that the browser exposes cross-origin."
      ];
    }

    if (finding.id === "cookies-missing-secure") {
      return [
        "The user reaches the site over HTTP or a downgraded entry path.",
        "An untrusted network or intermediary can observe traffic."
      ];
    }

    if (finding.id === "cookies-missing-httponly") {
      return [
        "Browser-side script gains execution on the page.",
        "The sensitive cookie is readable from client-side JavaScript."
      ];
    }

    if (finding.id === "cookies-missing-samesite") {
      return [
        "A state-changing endpoint still trusts browser cookies on cross-site requests.",
        "No stronger anti-CSRF control stops the request independently."
      ];
    }

    if (
      finding.id === "headers-x-powered-by" ||
      finding.id === "headers-server-version" ||
      finding.id === "content-generator-version"
    ) {
      return ["An attacker can view public headers or page source without authentication."];
    }

    if (finding.id.startsWith("content-mixed-")) {
      return [
        "At least one referenced asset, action, or dependency still uses HTTP.",
        "An attacker can tamper with that plaintext path."
      ];
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      return [
        "A victim submits credentials through the affected form.",
        "Traffic crosses an untrusted network or intermediary."
      ];
    }

    if (finding.id.startsWith("forms-external-action-")) {
      return [
        "The form handles identifying, financial, or otherwise sensitive input.",
        "The external endpoint becomes part of the trust boundary."
      ];
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      return [
        "A third-party script is loaded into the page.",
        "That supplier or its delivery chain is compromised."
      ];
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      return ["The exposed directory path is directly reachable from the public internet."];
    }

    return [
      "The affected page or response remains publicly reachable.",
      "An attacker can interact with it through a normal browser path."
    ];
  }

  private describeFixExample(finding: WebsiteScanFinding): string {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (exposureKind === "api_docs") {
      return "Move OpenAPI, Swagger, GraphiQL, or similar explorer routes behind authenticated admin access, or publish a sanitized public variant that omits internal and privileged endpoints.";
    }
    if (exposureKind === "api_data") {
      return "Require an authenticated session and role checks on user, admin, internal, and config APIs, then trim the response to only the fields the caller truly needs.";
    }
    if (exposureKind === "database_interface") {
      return "Remove public routes to phpMyAdmin, Adminer, Elasticsearch cat APIs, Mongo Express, or similar tools, and bind those surfaces to private networks or jump-host-only access.";
    }
    if (exposureKind === "internal_service") {
      return "Expose health and metrics endpoints only on an internal listener or behind admin authentication, and disable debug or environment endpoints that are not required in production.";
    }
    if (exposureKind === "sensitive_file") {
      return "Keep `.env` and server-side config outside the web root, serve only a deliberate client-safe config artifact, and block direct access to sensitive filenames at the edge.";
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return "Install the full certificate chain on the public edge, including intermediate certificates, then verify the deployed hostname and expiry from multiple networks.";
    }

    if (
      finding.id === "headers-missing-csp" ||
      finding.id === "headers-weak-csp"
    ) {
      return "Start with a report-only policy such as default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none', then tighten per trusted asset origin.";
    }

    if (finding.id === "headers-missing-frame-protection") {
      return "Set X-Frame-Options: DENY or add frame-ancestors 'none' to CSP unless framing is an intentional requirement.";
    }

    if (finding.id === "headers-missing-nosniff") {
      return "Return X-Content-Type-Options: nosniff on HTML, JavaScript, CSS, and downloadable assets.";
    }

    if (finding.id === "headers-missing-referrer-policy") {
      return "Use Referrer-Policy: strict-origin-when-cross-origin or a stricter policy if full path sharing is unnecessary.";
    }

    if (finding.id === "headers-missing-permissions-policy") {
      return "Ship a Permissions-Policy that disables browser features the site does not need.";
    }

    if (finding.id === "cors-wildcard-credentials" || finding.id === "cors-wildcard-origin") {
      return "Replace wildcard origin handling with an explicit allowlist and keep credentialed CORS off unless a documented browser flow requires it.";
    }

    if (finding.id === "cookies-missing-secure") {
      return "Mark session and auth cookies Secure, pair them with an HTTP-to-HTTPS redirect, and enable HSTS at the edge.";
    }

    if (finding.id === "cookies-missing-httponly") {
      return "Apply HttpOnly to session cookies unless client-side JavaScript truly has to read them.";
    }

    if (finding.id === "cookies-missing-samesite") {
      return "Use SameSite=Lax for standard sessions or SameSite=Strict where cross-site flows are not needed.";
    }

    if (
      finding.id === "headers-x-powered-by" ||
      finding.id === "headers-server-version" ||
      finding.id === "content-generator-version"
    ) {
      return "Strip or standardize Server, X-Powered-By, and generator metadata at the app or reverse proxy layer.";
    }

    if (finding.id.startsWith("content-mixed-")) {
      return "Serve every script, stylesheet, image, iframe, and form action from HTTPS URLs only.";
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      return "Serve the form page over HTTPS and post credentials only to HTTPS endpoints under trusted control.";
    }

    if (finding.id.startsWith("forms-external-action-")) {
      return "Keep form actions same-origin where possible or explicitly document and monitor the external trust boundary.";
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      return "Reduce third-party scripts, pin vendors, and pair them with tighter CSP and integrity controls where possible.";
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      return "Disable directory indexes and restrict public paths to explicitly intended assets only.";
    }

    return finding.remediation;
  }

  private describeSafeVerification(finding: WebsiteScanFinding): string {
    const exposureKind = this.classifyExposureFinding(finding.id);
    if (exposureKind === "api_docs") {
      return "Restrict the documentation route, reload it anonymously, and rerun the review to confirm the explorer or schema is no longer publicly reachable.";
    }
    if (exposureKind === "api_data") {
      return "Repeat the same anonymous GET request and confirm it now returns a 401/403 or a minimal non-sensitive response before rerunning the review.";
    }
    if (exposureKind === "database_interface") {
      return "Remove the public route or add a private boundary, then reload the same path from the internet edge and confirm it is no longer directly reachable.";
    }
    if (exposureKind === "internal_service") {
      return "Restrict the management or diagnostics route, fetch it anonymously again, and confirm the response is now blocked or reduced to a safe minimal signal.";
    }
    if (exposureKind === "sensitive_file") {
      return "Block direct access to the sensitive filename, request it anonymously again, and confirm the response no longer serves server-side configuration content.";
    }

    if (finding.id === "transport-invalid-tls-certificate") {
      return "After updating the public certificate chain, reload the site in a normal browser with no warning banner, then rerun this review and confirm certificate trust passes.";
    }

    if (finding.id === "headers-missing-csp" || finding.id === "headers-weak-csp") {
      return "Deploy the policy in report-only mode first, reload the affected pages, then rerun this review and confirm the CSP check passes without breaking required assets.";
    }

    if (finding.id === "headers-missing-frame-protection") {
      return "Return X-Frame-Options or frame-ancestors on the response, then rerun the review and confirm the frame embedding check moves to pass.";
    }

    if (finding.id === "headers-missing-nosniff") {
      return "Inspect the updated response headers and confirm X-Content-Type-Options: nosniff is present before rerunning the review.";
    }

    if (finding.id === "headers-missing-referrer-policy") {
      return "Set the policy at the edge or app layer, reload the entry page, and confirm the header is present in the next review run.";
    }

    if (finding.id === "headers-missing-permissions-policy") {
      return "Ship an explicit Permissions-Policy, verify that required browser features still work, then rerun the review to confirm the check passes.";
    }

    if (finding.id.startsWith("cors-")) {
      return "Replace wildcard CORS with explicit origins, then inspect the response headers and rerun the review to confirm the CORS check tightens.";
    }

    if (finding.id.startsWith("cookies-")) {
      return "Inspect the next Set-Cookie response for Secure, HttpOnly, and SameSite as intended, then rerun the review to confirm cookie hygiene improves.";
    }

    if (finding.id.startsWith("content-mixed-")) {
      return "Replace every HTTP reference on the page with HTTPS, reload the page, and rerun the review to confirm mixed-content findings disappear.";
    }

    if (finding.id.startsWith("forms-insecure-password-")) {
      return "Serve the page and form action on HTTPS, submit a test login through a controlled account, and rerun the review to confirm insecure password transport is gone.";
    }

    if (finding.id.startsWith("forms-external-action-")) {
      return "Move the form to a same-origin action or document the external endpoint deliberately, then rerun the review to confirm the form boundary is as intended.";
    }

    if (finding.id.startsWith("content-third-party-scripts-")) {
      return "Reduce or replace the third-party script, reload the page, and rerun the review to confirm the external supplier count drops as expected.";
    }

    if (finding.id.startsWith("content-directory-listing-")) {
      return "Disable directory indexing at the server or CDN edge, reload the exposed path, and rerun the review to confirm the listing is no longer returned.";
    }

    return "Apply the hardening change, reload the affected public page, and rerun this review to confirm the issue no longer appears.";
  }

  private readCheckStatus(
    checks: SecurityReviewCheck[],
    id: string
  ): SecurityReviewCheckStatus {
    return checks.find((check) => check.id === id)?.status ?? "info";
  }

  private combineAttackPathStatuses(
    ...statuses: SecurityReviewCheckStatus[]
  ): SecurityReviewAttackPath["status"] {
    if (statuses.includes("fail")) {
      return "exposed";
    }

    if (statuses.includes("warn")) {
      return "constrained";
    }

    return "blocked";
  }

  private toAttackPathStatus(
    status: SecurityReviewCheckStatus
  ): SecurityReviewAttackPath["status"] {
    if (status === "fail") {
      return "exposed";
    }

    if (status === "warn") {
      return "constrained";
    }

    return "blocked";
  }

  private attackPathEffort(
    status: SecurityReviewAttackPath["status"]
  ): SecurityReviewAttackerEffort {
    if (status === "exposed") {
      return "low";
    }

    if (status === "constrained") {
      return "medium";
    }

    return "high";
  }

  private countStatuses(checks: SecurityReviewCheck[]): SecurityReviewResult["counts"] {
    return checks.reduce(
      (counts, check) => {
        if (check.status === "pass") {
          counts.pass += 1;
        } else if (check.status === "warn") {
          counts.warn += 1;
        } else if (check.status === "fail") {
          counts.fail += 1;
        }

        return counts;
      },
      {
        pass: 0,
        warn: 0,
        fail: 0
      }
    );
  }

  private buildRoadmap(
    findings: SecurityReviewFinding[]
  ): SecurityReviewResult["summary"]["roadmap"] {
    const roadmap = {
      immediate: [] as string[],
      next: [] as string[],
      hardening: [] as string[]
    };

    for (const finding of findings) {
      const bucket = roadmap[finding.priority];
      if (!bucket.includes(finding.remediation)) {
        bucket.push(finding.remediation);
      }
    }

    return {
      immediate: roadmap.immediate.slice(0, 4),
      next: roadmap.next.slice(0, 4),
      hardening: roadmap.hardening.slice(0, 4)
    };
  }

  private priorityRank(priority: SecurityReviewPriority): number {
    switch (priority) {
      case "immediate":
        return 0;
      case "next":
        return 1;
      default:
        return 2;
    }
  }

  private severityRank(severity: SecurityReviewFindingSeverity): number {
    switch (severity) {
      case "high":
        return 3;
      case "medium":
        return 2;
      default:
        return 1;
    }
  }

  private isWeakContentSecurityPolicy(policy: string): boolean {
    const normalized = policy.toLowerCase();
    return (
      normalized.includes("'unsafe-inline'") ||
      normalized.includes("'unsafe-eval'") ||
      normalized.includes("*") ||
      normalized.includes("http:")
    );
  }

  private redactPolicy(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  private normalizeModelName(model: string): string {
    return model.trim().replace(/:latest$/i, "").toLowerCase();
  }
}
