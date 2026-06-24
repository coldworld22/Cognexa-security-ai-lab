import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { SecurityReviewService } from "../src/services/security-review/security-review.service";
import { WebsiteScanResult } from "../src/services/website-scanner/website-scanner.service";

function createActor(role: AccessContext["role"] = "manager"): AccessContext {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role,
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: ["chat", "memory", "rag", "agents", "tools", "admin_dashboard"]
  };
}

function createScanResult(
  overrides: Partial<WebsiteScanResult> = {}
): WebsiteScanResult {
  return {
    scannedAt: "2026-06-21T07:10:00.000Z",
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com",
    hostname: "example.com",
    pagesScanned: 2,
    maxPages: 4,
    sameOriginPagesDiscovered: 2,
    securityScore: 72,
    grade: "C",
    findingCounts: {
      info: 0,
      low: 0,
      medium: 1,
      high: 1
    },
    analysis: {
      mode: "http",
      browserAttempted: false,
      browserSucceeded: false,
      browserEngine: null
    },
    summary: {
      riskLevel: "high",
      headline: "The passive scan covered 2 page(s) and found hardening gaps.",
      strengths: ["HTTP redirects to HTTPS", "Observed HTTPS cookies use the Secure attribute."],
      topRisks: ["Clickjacking protection is missing"],
      recommendedActions: [
        "Add X-Frame-Options or define frame-ancestors in CSP to restrict embedding."
      ]
    },
    warnings: [],
    transport: {
      initialProtocol: "https",
      finalProtocol: "https",
      redirectedToHttps: true,
      hstsEnabled: true,
      certificateTrusted: true
    },
    headers: {
      contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'",
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: "camera=(), microphone=()",
      crossOriginOpenerPolicy: "same-origin",
      accessControlAllowOrigin: null,
      accessControlAllowCredentials: null,
      server: null,
      xPoweredBy: null
    },
    cookies: {
      total: 1,
      missingSecure: 0,
      missingHttpOnly: 0,
      missingSameSite: 0
    },
    crawl: {
      attemptedPages: 2,
      scannedPages: 2,
      failedPages: 0,
      skippedCrossOriginPages: 0,
      skippedNonHtmlPages: 0,
      duplicatePagesSkipped: 0,
      discoveredSameOriginPages: 2,
      discoveredExternalLinks: 0
    },
    surface: {
      totalForms: 1,
      loginForms: 1,
      externalFormActions: 0,
      insecurePasswordSubmissions: 0,
      inlineScripts: 1,
      externalScripts: 1,
      thirdPartyScripts: 0,
      mixedContentReferences: 0,
      directoryListings: 0
    },
    exposures: {
      probedEndpoints: 0,
      publicApiDocs: 0,
      publicApiEndpoints: 0,
      publicDatabaseInterfaces: 0,
      publicInternalServices: 0,
      sensitiveFiles: 0,
      endpoints: []
    },
    resources: [
      {
        name: "robots.txt",
        path: "/robots.txt",
        status: "present",
        statusCode: 200
      },
      {
        name: "security.txt",
        path: "/.well-known/security.txt",
        status: "missing",
        statusCode: 404
      },
      {
        name: "sitemap.xml",
        path: "/sitemap.xml",
        status: "present",
        statusCode: 200
      }
    ],
    fingerprints: [],
    pages: [
      {
        url: "https://example.com",
        title: "Home",
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        linkCount: 3,
        sameOriginLinkCount: 2,
        externalLinkCount: 1,
        formCount: 1,
        loginFormCount: 1,
        externalFormActionCount: 0,
        insecurePasswordSubmitCount: 0,
        inlineScriptCount: 1,
        externalScriptCount: 1,
        thirdPartyScriptCount: 0,
        mixedContentCount: 0,
        directoryListingDetected: false
      },
      {
        url: "https://example.com/login",
        title: "Login",
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        linkCount: 1,
        sameOriginLinkCount: 1,
        externalLinkCount: 0,
        formCount: 1,
        loginFormCount: 1,
        externalFormActionCount: 0,
        insecurePasswordSubmitCount: 0,
        inlineScriptCount: 0,
        externalScriptCount: 0,
        thirdPartyScriptCount: 0,
        mixedContentCount: 0,
        directoryListingDetected: false
      }
    ],
    findings: [],
    ...overrides
  };
}

test("SecurityReviewService converts website findings into attacker-facing report content", async () => {
  const actor = createActor();
  const scanResult = createScanResult({
    securityScore: 41,
    grade: "F",
    summary: {
      riskLevel: "critical",
      headline: "The passive scan covered 2 page(s) and found high-severity issues.",
      strengths: ["HTTP redirects to HTTPS"],
      topRisks: [
        "Clickjacking protection is missing",
        "HTTPS cookies are missing the Secure flag"
      ],
      recommendedActions: [
        "Add X-Frame-Options or define frame-ancestors in CSP to restrict embedding.",
        "Mark session and sensitive cookies as Secure so they are not sent over plain HTTP."
      ]
    },
    headers: {
      contentSecurityPolicy: null,
      xFrameOptions: null,
      xContentTypeOptions: null,
      referrerPolicy: null,
      permissionsPolicy: null,
      crossOriginOpenerPolicy: null,
      accessControlAllowOrigin: "*",
      accessControlAllowCredentials: "true",
      server: "nginx/1.25.4",
      xPoweredBy: "Express"
    },
    cookies: {
      total: 2,
      missingSecure: 1,
      missingHttpOnly: 1,
      missingSameSite: 1
    },
    surface: {
      totalForms: 1,
      loginForms: 1,
      externalFormActions: 0,
      insecurePasswordSubmissions: 0,
      inlineScripts: 2,
      externalScripts: 2,
      thirdPartyScripts: 1,
      mixedContentReferences: 0,
      directoryListings: 1
    },
    exposures: {
      probedEndpoints: 8,
      publicApiDocs: 1,
      publicApiEndpoints: 1,
      publicDatabaseInterfaces: 1,
      publicInternalServices: 0,
      sensitiveFiles: 0,
      endpoints: [
        {
          url: "https://example.com/openapi.json",
          kind: "api_documentation",
          statusCode: 200,
          contentType: "application/json",
          evidence: ["status=200", "content-type=application/json", "markers=api_schema"]
        },
        {
          url: "https://example.com/api/users",
          kind: "api_endpoint",
          statusCode: 200,
          contentType: "application/json",
          evidence: ["status=200", "content-type=application/json", "keys=email,role"]
        },
        {
          url: "https://example.com/adminer.php",
          kind: "database_interface",
          statusCode: 200,
          contentType: "text/html; charset=utf-8",
          evidence: ["status=200", "service=Adminer"]
        }
      ]
    },
    fingerprints: [
      {
        source: "server",
        value: "nginx/1.25.4",
        sanitizedValue: "nginx/<version>"
      }
    ],
    findings: [
      {
        id: "headers-missing-frame-protection",
        severity: "medium",
        category: "headers",
        title: "Clickjacking protection is missing",
        summary:
          "Neither X-Frame-Options nor CSP frame-ancestors was present on the root response.",
        remediation:
          "Add X-Frame-Options or define frame-ancestors in CSP to restrict embedding.",
        evidence: ["https://example.com"]
      },
      {
        id: "cookies-missing-secure",
        severity: "high",
        category: "cookies",
        title: "HTTPS cookies are missing the Secure flag",
        summary:
          "One or more cookies set over HTTPS did not include the Secure attribute.",
        remediation:
          "Mark session and sensitive cookies as Secure so they are not sent over plain HTTP.",
        evidence: ["1 cookie(s) missing Secure"]
      },
      {
        id: "content-directory-listing-https://example.com/assets/",
        severity: "medium",
        category: "content",
        title: "Directory listing appears enabled",
        summary:
          "The page content resembles an index listing, which can expose unintended file structure and artifacts.",
        remediation:
          "Disable directory listing on the web server and ensure only intended assets are publicly reachable.",
        pageUrl: "https://example.com/assets/",
        evidence: ["https://example.com/assets/"]
      },
      {
        id: "exposure-database-interface-https://example.com/adminer.php",
        severity: "high",
        category: "exposure",
        title: "Adminer appears publicly reachable",
        summary:
          "A database administration or cluster-management surface responded on the public origin, which can expose internal data layout and sharply reduce attacker effort.",
        remediation:
          "Move database management surfaces behind private network controls, require strong authentication, and remove any public route that reaches them directly.",
        pageUrl: "https://example.com/adminer.php",
        evidence: ["status=200", "service=Adminer"]
      }
    ]
  });

  const service = new SecurityReviewService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      listProviders: async () => [
        {
          id: "qwen",
          models: ["qwen2.5-coder"]
        }
      ],
      createStructuredOutput: async () => ({
        headline: "The public surface exposes transport and browser-trust gaps that should be fixed before deeper expansion work.",
        analystPerspective:
          "A disciplined external attacker would start with the exposed browser trust boundary and only then chain into session or recon paths.",
        decisiveVerdict:
          "Fix transport and framing weaknesses first because they lower attacker effort immediately.",
        decisions: [
          {
            title: "Close transport and framing gaps",
            priority: "immediate",
            rationale:
              "These findings reduce attacker effort on the first public entry point and increase user exposure quickly.",
            safeAction:
              "Enforce trusted HTTPS, repair cookie transport, and add framing protections before expanding the crawl scope."
          }
        ],
        retestFocus: [
          "Rerun the review after HTTPS, cookie, and frame controls are corrected.",
          "Confirm the exposed attack paths move from exposed to constrained or blocked."
        ],
        constraints: [
          "This analyst only used passive scan evidence from the public site."
        ]
      })
    } as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder"
    }
  );

  const result = await service.runReview(actor, {
    url: "https://example.com",
    maxPages: 4
  });

  assert.equal(result.summary.riskLevel, "critical");
  assert.equal(result.posture.grade, "F");
  assert.equal(result.target.finalUrl, "https://example.com");
  assert.equal(
    result.attackPaths.find((path) => path.id === "attack-path-clickjacking")?.status,
    "exposed"
  );
  assert.equal(
    result.attackPaths.find((path) => path.id === "attack-path-recon")?.status,
    "exposed"
  );
  assert.ok(
    result.findings.some((finding) =>
      finding.attackerView.includes("hidden frame")
    )
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.id === "headers-missing-frame-protection" &&
        finding.priority === "immediate" &&
        finding.attackerEffort === "medium" &&
        finding.safeVerification.includes("frame embedding check")
    )
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.id === "cookies-missing-secure" &&
        finding.impact.includes("Session-bearing cookies")
    )
  );
  assert.ok(
    result.findings.some((finding) =>
      finding.fixExample.includes("X-Frame-Options: DENY")
    )
  );
  assert.ok(
    result.attackPaths.some(
      (path) =>
        path.id === "attack-path-browser-boundaries" &&
        path.supportingCheckIds.includes("headers-permissions-policy")
    )
  );
  assert.ok(result.summary.roadmap.immediate.length > 0);
  assert.equal(
    result.checks.find((check) => check.id === "cookies-flag-hygiene")?.status,
    "fail"
  );
  assert.equal(
    result.checks.find((check) => check.id === "headers-permissions-policy")?.status,
    "warn"
  );
  assert.equal(
    result.checks.find((check) => check.id === "exposure-public-services")?.status,
    "fail"
  );
  assert.equal(
    result.attackPaths.find((path) => path.id === "attack-path-service-exposure")?.status,
    "exposed"
  );
  assert.equal(result.aiAnalysis.status, "ready");
  assert.equal(result.aiAnalysis.provider, "qwen");
  assert.ok(result.aiAnalysis.decisions.length > 0);
});

test("SecurityReviewService reports blocked attacker paths when website posture is strong", async () => {
  const actor = createActor("admin");
  const scanResult = createScanResult({
    securityScore: 96,
    grade: "A",
    summary: {
      riskLevel: "low",
      headline: "The passive scan covered 2 page(s) and did not detect immediate gaps.",
      strengths: [
        "HTTP redirects to HTTPS",
        "Strict-Transport-Security was present.",
        "No insecure password forms or mixed-content references were seen."
      ],
      topRisks: [],
      recommendedActions: [
        "Keep monitoring the public surface and supplement this passive scan with authenticated testing where appropriate."
      ]
    }
  });

  const service = new SecurityReviewService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      listProviders: async () => []
    } as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder"
    }
  );

  const result = await service.runReview(actor, {
    url: "https://example.com",
    maxPages: 4
  });

  assert.equal(result.summary.riskLevel, "low");
  assert.equal(result.findings.length, 0);
  assert.equal(result.counts.fail, 0);
  assert.equal(result.counts.warn, 0);
  assert.equal(result.summary.roadmap.immediate.length, 0);
  assert.ok(result.checks.every((check) => check.status === "pass" || check.status === "info"));
  assert.ok(result.attackPaths.every((path) => path.status === "blocked"));
  assert.equal(result.aiAnalysis.status, "unavailable");
});
