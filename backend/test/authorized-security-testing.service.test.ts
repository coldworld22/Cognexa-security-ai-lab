import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { AuthorizedSecurityTestingService } from "../src/services/authorized-testing/authorized-security-testing.service";
import { WebsiteScanResult } from "../src/services/website-scanner/website-scanner.service";

function createActor(): AccessContext {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role: "admin",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: ["admin_dashboard"]
  };
}

function createVerificationRepository() {
  const store = new Map<string, Record<string, unknown>>();

  return {
    create: async (input: Record<string, unknown>) => {
      const entity = {
        id: `verification-${store.size + 1}`,
        createdAt: "2026-06-21T07:00:00.000Z",
        updatedAt: "2026-06-21T07:00:00.000Z",
        ...input
      };
      store.set(entity.id, entity);
      return entity;
    },
    findById: async (id: string) => {
      return (store.get(id) as never) ?? null;
    },
    listByWorkspace: async (workspaceId: string) => {
      return [...store.values()].filter(
        (item) => item.workspaceId === workspaceId
      ) as never;
    },
    updateStatus: async (id: string, input: Record<string, unknown>) => {
      const current = store.get(id)!;
      const next = {
        ...current,
        ...input,
        updatedAt: "2026-06-21T07:05:00.000Z"
      };
      store.set(id, next);
      return next as never;
    }
  };
}

function createRunRepository() {
  const store = new Map<string, Record<string, unknown>>();

  return {
    create: async (input: Record<string, unknown>) => {
      const entity = {
        id: `run-${store.size + 1}`,
        createdAt: "2026-06-21T07:10:00.000Z",
        updatedAt: "2026-06-21T07:10:00.000Z",
        ...input
      };
      store.set(entity.id, entity);
      return entity as never;
    },
    findById: async (id: string) => {
      return (store.get(id) as never) ?? null;
    },
    listByWorkspace: async (workspaceId: string) => {
      return [...store.values()].filter(
        (item) => item.workspaceId === workspaceId
      ) as never;
    },
    update: async (id: string, input: Record<string, unknown>) => {
      const current = store.get(id)!;
      const next = {
        ...current,
        ...input,
        updatedAt: "2026-06-21T07:20:00.000Z"
      };
      store.set(id, next);
      return next as never;
    }
  };
}

function createEventRepository() {
  const store: Record<string, unknown>[] = [];

  return {
    create: async (input: Record<string, unknown>) => {
      const entity = {
        id: `event-${store.length + 1}`,
        createdAt: `2026-06-21T07:${String(store.length).padStart(2, "0")}:00.000Z`,
        updatedAt: `2026-06-21T07:${String(store.length).padStart(2, "0")}:00.000Z`,
        ...input
      };
      store.push(entity);
      return entity as never;
    },
    listByRun: async (runId: string) => {
      return store.filter((item) => item.runId === runId) as never;
    }
  };
}

function createScanResult(): WebsiteScanResult {
  return {
    scannedAt: "2026-06-21T07:10:00.000Z",
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com",
    hostname: "example.com",
    pagesScanned: 3,
    maxPages: 4,
    sameOriginPagesDiscovered: 3,
    securityScore: 58,
    grade: "D",
    findingCounts: {
      info: 0,
      low: 1,
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
      headline: "Passive baseline completed.",
      strengths: [],
      topRisks: [],
      recommendedActions: []
    },
    warnings: ["Passive baseline saw weak cookie flags."],
    transport: {
      initialProtocol: "https",
      finalProtocol: "https",
      redirectedToHttps: true,
      hstsEnabled: true,
      certificateTrusted: true
    },
    headers: {
      contentSecurityPolicy: null,
      xFrameOptions: null,
      xContentTypeOptions: "nosniff",
      referrerPolicy: null,
      permissionsPolicy: null,
      crossOriginOpenerPolicy: null,
      accessControlAllowOrigin: null,
      accessControlAllowCredentials: null,
      server: null,
      xPoweredBy: null
    },
    cookies: {
      total: 2,
      missingSecure: 1,
      missingHttpOnly: 1,
      missingSameSite: 1
    },
    crawl: {
      attemptedPages: 3,
      scannedPages: 3,
      failedPages: 0,
      skippedCrossOriginPages: 0,
      skippedNonHtmlPages: 0,
      duplicatePagesSkipped: 0,
      discoveredSameOriginPages: 3,
      discoveredExternalLinks: 0
    },
    surface: {
      totalForms: 1,
      loginForms: 1,
      externalFormActions: 0,
      insecurePasswordSubmissions: 0,
      inlineScripts: 0,
      externalScripts: 0,
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
    resources: [],
    fingerprints: [],
    pages: [
      {
        url: "https://example.com",
        title: "Home",
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        linkCount: 3,
        sameOriginLinkCount: 3,
        externalLinkCount: 0,
        formCount: 0,
        loginFormCount: 0,
        externalFormActionCount: 0,
        insecurePasswordSubmitCount: 0,
        inlineScriptCount: 0,
        externalScriptCount: 0,
        thirdPartyScriptCount: 0,
        mixedContentCount: 0,
        directoryListingDetected: false
      },
      {
        url: "https://example.com/search",
        title: "Search",
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        linkCount: 1,
        sameOriginLinkCount: 1,
        externalLinkCount: 0,
        formCount: 0,
        loginFormCount: 0,
        externalFormActionCount: 0,
        insecurePasswordSubmitCount: 0,
        inlineScriptCount: 0,
        externalScriptCount: 0,
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
    findings: []
  };
}

test("AuthorizedSecurityTestingService verifies domain ownership with an HTTP challenge", async () => {
  const verificationRepository = createVerificationRepository();
  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {} as never,
    {} as never,
    verificationRepository as never,
    createRunRepository() as never,
    createEventRepository() as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (input) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;

        if (url === "https://example.com/.well-known/cognexa-security-test.txt") {
          return new Response("token-expected", {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        return new Response("not-found", { status: 404 });
      }) as never,
      now: () => new Date("2026-06-21T07:00:00.000Z")
    }
  );

  const started = await service.startDomainVerification(createActor(), {
    target: "example.com",
    method: "http_file"
  });

  await verificationRepository.updateStatus(started.id, {
    challengeToken: "token-expected",
    challengeDetails: {
      requestedUrl: "https://example.com/",
      path: "/.well-known/cognexa-security-test.txt",
      verificationUrl: "https://example.com/.well-known/cognexa-security-test.txt",
      expectedValue: "token-expected"
    }
  });

  const checked = await service.checkDomainVerification(createActor(), started.id);

  assert.equal(started.status, "pending");
  assert.equal(checked.status, "verified");
  assert.equal(checked.method, "http_file");
  assert.equal(checked.challengeDetails.verificationUrl, "https://example.com/.well-known/cognexa-security-test.txt");
});

test("AuthorizedSecurityTestingService runs safe active probes and records findings", async () => {
  const verificationRepository = createVerificationRepository();
  const runRepository = createRunRepository();
  const eventRepository = createEventRepository();
  const scanResult = createScanResult();

  const verification = await verificationRepository.create({
    workspaceId: "workspace-1",
    organizationId: "org-1",
    requestedByUserId: "user-1",
    hostname: "example.com",
    method: "dns_txt",
    status: "verified",
    challengeToken: "token-1",
    challengeDetails: {
      requestedUrl: "https://example.com",
      recordName: "_cognexa-security-test.example.com",
      expectedValue: "cognexa-verification=token-1"
    },
    expiresAt: "2026-07-21T07:00:00.000Z",
    verifiedAt: "2026-06-21T07:00:00.000Z"
  } as never);

  let llmCall = 0;
  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      createStructuredOutput: async (_provider, request) => {
        llmCall += 1;
        if (llmCall === 1) {
          return {
            steps: [
              {
                category: "sql_injection",
                title: "Check search",
                objective: "Probe search safely",
                safeMethod: "GET only",
                stopConditions: ["Stop at the request budget."]
              },
              {
                category: "authentication",
                title: "Check protected routes",
                objective: "Ensure admin is challenged",
                safeMethod: "Anonymous GET only",
                stopConditions: ["Stop at the request budget."]
              },
              {
                category: "session_management",
                title: "Check session controls",
                objective: "Validate cookie flags",
                safeMethod: "Read-only header checks",
                stopConditions: ["Stop at the request budget."]
              }
            ]
          };
        }

        if (llmCall === 2) {
          const payload = JSON.parse(request.messages[1]?.content ?? "{}") as {
            findings?: Array<{
              id: string;
              category: string;
            }>;
          };
          const findingByCategory = new Map(
            (payload.findings ?? []).map((finding) => [finding.category, finding.id])
          );

          return {
            validations: [
              {
                findingId: findingByCategory.get("sql_injection") ?? "sql_injection",
                disposition: "confirmed",
                confidence: 94,
                rationale:
                  "A quote-triggered request produced a deterministic server-side error signature."
              },
              {
                findingId: findingByCategory.get("authentication") ?? "authentication",
                disposition: "confirmed",
                confidence: 88,
                rationale:
                  "The anonymous request reached protected content instead of redirecting to a login boundary."
              },
              {
                findingId:
                  findingByCategory.get("session_management") ?? "session_management",
                disposition: "confirmed",
                confidence: 82,
                rationale:
                  "The cookie posture issue is directly observable from the passive baseline and read-only headers."
              }
            ]
          };
        }

        if (llmCall === 3) {
          return {
            predictions: [
              {
                category: "api_security",
                title: "Additional API discovery surface may exist",
                likelihood: "medium",
                rationale:
                  "The current run focused on the web flow, but the same trust boundary may also affect adjacent API endpoints.",
                indicators: ["/search", "/login"],
                recommendedCheck:
                  "Expand the next read-only run with safe API discovery and OPTIONS coverage."
              }
            ]
          };
        }

        if (llmCall === 4) {
          const payload = JSON.parse(request.messages[1]?.content ?? "{}") as {
            findings?: Array<{
              id: string;
              category: string;
            }>;
          };
          const findingByCategory = new Map(
            (payload.findings ?? []).map((finding) => [finding.category, finding.id])
          );

          return {
            attackPaths: [
              {
                title: "Anonymous access reaches protected routes after input handling weaknesses",
                status: "exposed",
                narrative:
                  "The confirmed search error behavior and direct anonymous admin access show that backend trust boundaries need review before broader chaining is attempted.",
                supportingFindingIds: [
                  findingByCategory.get("sql_injection"),
                  findingByCategory.get("authentication")
                ].filter((value): value is string => Boolean(value)),
                remediationPriority: "immediate",
                safeValidation:
                  "Retest with the same read-only search probe and an anonymous GET to the protected route after fixes.",
                confidence: 86
              }
            ]
          };
        }

        return {
          headline: "Address the confirmed high-risk issues first.",
          executiveSummary:
            "The safe read-only probes confirmed issues in input handling and route protection.",
          nextSteps: [
            "Parameterize the search endpoint.",
            "Require authentication on admin routes."
          ]
        };
      }
    } as never,
    verificationRepository as never,
    runRepository as never,
    eventRepository as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (input, init) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;
        const method = init?.method ?? "GET";

        if (method === "OPTIONS") {
          return new Response("", { status: 204 });
        }

        if (url === "https://example.com/search") {
          return new Response("Search page", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        if (url.includes("https://example.com/search?q=1%27")) {
          return new Response("SQL syntax error near ''", {
            status: 500,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/admin") {
          return new Response("<html><body>Admin dashboard</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/login") {
          return new Response("<html><body>Login form</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        return new Response("<html><body>Home</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }) as never,
      now: () => new Date("2026-06-21T07:15:00.000Z")
    }
  );

  const report = await service.runAuthorizedSecurityTest(createActor(), {
    verificationId: verification.id as string,
    url: "https://example.com",
    modules: ["sql_injection", "authentication", "session_management"],
    maxPages: 4,
    maxRequests: 18
  });

  assert.equal(report.status, "completed");
  assert.equal(report.ownership.status, "verified");
  assert.equal(report.summary.planSource, "ai");
  assert.equal(report.aiAnalysis.status, "ready");
  assert.equal(report.aiAnalysis.predictions.length, 1);
  assert.equal(report.findings.some((finding) => finding.category === "sql_injection"), true);
  assert.equal(report.findings.some((finding) => finding.category === "authentication"), true);
  assert.equal(report.findings.some((finding) => finding.category === "session_management"), true);
  assert.equal(
    report.findings
      .filter((finding) =>
        ["sql_injection", "authentication", "session_management"].includes(
          finding.category
        )
      )
      .some((finding) => finding.validation?.source === "ai"),
    true
  );
  assert.equal(report.attackPaths[0]?.source, "ai");
  assert.equal(report.events.length > 0, true);
  assert.equal(report.summary.requestsSent > 0, true);
});

test("AuthorizedSecurityTestingService prioritizes modules, reuses equivalent probes, and adapts to rate limiting", async () => {
  const verificationRepository = createVerificationRepository();
  const runRepository = createRunRepository();
  const eventRepository = createEventRepository();
  const scanResult = createScanResult();
  scanResult.pages.push({
    url: "https://example.com/admin",
    title: "Admin",
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    linkCount: 1,
    sameOriginLinkCount: 1,
    externalLinkCount: 0,
    formCount: 0,
    loginFormCount: 0,
    externalFormActionCount: 0,
    insecurePasswordSubmitCount: 0,
    inlineScriptCount: 0,
    externalScriptCount: 0,
    thirdPartyScriptCount: 0,
    mixedContentCount: 0,
    directoryListingDetected: false
  });

  const verification = await verificationRepository.create({
    workspaceId: "workspace-1",
    organizationId: "org-1",
    requestedByUserId: "user-1",
    hostname: "example.com",
    method: "dns_txt",
    status: "verified",
    challengeToken: "token-2",
    challengeDetails: {
      requestedUrl: "https://example.com",
      recordName: "_cognexa-security-test.example.com",
      expectedValue: "cognexa-verification=token-2"
    },
    expiresAt: "2026-07-21T07:00:00.000Z",
    verifiedAt: "2026-06-21T07:00:00.000Z"
  } as never);

  let llmCall = 0;
  let anonymousAdminAttempts = 0;
  let privilegedAdminAttempts = 0;

  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      createStructuredOutput: async (_provider, request) => {
        llmCall += 1;
        if (llmCall === 1) {
          return {
            steps: [
              {
                category: "authentication",
                title: "Challenge protected routes",
                objective: "Check anonymous access to privileged pages",
                safeMethod: "GET only",
                stopConditions: ["Stop at the request budget."]
              },
              {
                category: "authorization",
                title: "Compare role boundaries",
                objective: "Compare low and high privilege access",
                safeMethod: "GET only",
                stopConditions: ["Stop at the request budget."]
              }
            ]
          };
        }

        if (llmCall === 2) {
          const payload = JSON.parse(request.messages[1]?.content ?? "{}") as {
            findings?: Array<{
              id: string;
              category: string;
            }>;
          };
          const findingByCategory = new Map(
            (payload.findings ?? []).map((finding) => [finding.category, finding.id])
          );

          return {
            validations: [
              {
                findingId: findingByCategory.get("authentication") ?? "authentication",
                disposition: "confirmed",
                confidence: 87,
                rationale:
                  "Anonymous access returned protected content after a safe retry instead of a login challenge."
              },
              {
                findingId: findingByCategory.get("authorization") ?? "authorization",
                disposition: "confirmed",
                confidence: 90,
                rationale:
                  "The high-privilege profile succeeded and the lower-trust path still returned the same protected content."
              }
            ]
          };
        }

        if (llmCall === 3) {
          return {
            predictions: [
              {
                category: "session_management",
                title: "Privilege transitions may rely on weak session boundaries",
                likelihood: "medium",
                rationale:
                  "Access-control drift often correlates with weak cookie or session invalidation practices.",
                indicators: ["anonymous-admin-200", "low-vs-high-differential"],
                recommendedCheck:
                  "Add read-only logout and cache-control checks in the next run."
              }
            ]
          };
        }

        if (llmCall === 4) {
          const payload = JSON.parse(request.messages[1]?.content ?? "{}") as {
            findings?: Array<{
              id: string;
              category: string;
            }>;
          };
          const findingByCategory = new Map(
            (payload.findings ?? []).map((finding) => [finding.category, finding.id])
          );

          return {
            attackPaths: [
              {
                title: "Weak authentication and authorization combine into admin exposure",
                status: "exposed",
                narrative:
                  "The current read-only coverage shows that privileged content is reachable without the expected boundary checks.",
                supportingFindingIds: [
                  findingByCategory.get("authentication"),
                  findingByCategory.get("authorization")
                ].filter((value): value is string => Boolean(value)),
                remediationPriority: "immediate",
                safeValidation:
                  "Retest with anonymous, low-privilege, and high-privilege GET requests after the access-control fixes are deployed.",
                confidence: 91
              }
            ]
          };
        }

        return {
          headline: "Privilege boundaries need attention.",
          executiveSummary:
            "Adaptive retries completed safely and the cached comparison still confirmed access-control issues.",
          nextSteps: [
            "Require authentication on the admin route.",
            "Tighten authorization checks for lower-trust accounts."
          ]
        };
      }
    } as never,
    verificationRepository as never,
    runRepository as never,
    eventRepository as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (_input, init) => {
        const url =
          _input instanceof URL
            ? _input.toString()
            : typeof _input === "string"
              ? _input
              : _input.url;
        const method = init?.method ?? "GET";
        const headers = init?.headers as Record<string, string> | undefined;
        const authorizationHeader =
          headers?.Authorization ?? headers?.authorization ?? "";

        if (method === "OPTIONS") {
          return new Response("", { status: 204 });
        }

        if (url === "https://example.com/admin") {
          if (authorizationHeader === "Bearer high") {
            privilegedAdminAttempts += 1;
            return new Response("<html><body>Admin dashboard</body></html>", {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8"
              }
            });
          }

          anonymousAdminAttempts += 1;
          if (anonymousAdminAttempts === 1) {
            return new Response("Rate limited", {
              status: 429,
              headers: {
                "retry-after": "0",
                "content-type": "text/plain; charset=utf-8"
              }
            });
          }

          return new Response("<html><body>Admin dashboard</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/login") {
          return new Response("<html><body>Login form</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          });
        }

        return new Response("<html><body>Home</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }) as never,
      now: () => new Date("2026-06-21T07:30:00.000Z")
    }
  );

  const report = await service.runAuthorizedSecurityTest(createActor(), {
    verificationId: verification.id as string,
    url: "https://example.com",
    modules: ["authentication", "authorization"],
    maxPages: 4,
    maxRequests: 18,
    authProfiles: [
      {
        name: "low",
        role: "low_privilege",
        headers: {},
        cookies: {}
      },
      {
        name: "high",
        role: "high_privilege",
        headers: {
          Authorization: "Bearer high"
        },
        cookies: {}
      }
    ]
  });

  assert.equal(report.status, "completed");
  assert.equal(report.plan[0]?.category, "authorization");
  assert.equal(
    report.summary.prioritizedModules?.[0]?.module,
    "authorization"
  );
  assert.equal(report.summary.executionInsights?.moduleConcurrency, 2);
  assert.equal(report.summary.executionInsights?.adaptiveBackoffCount, 1);
  assert.equal(report.summary.executionInsights?.rateLimitedResponses, 1);
  assert.equal((report.summary.executionInsights?.probeCacheHits ?? 0) >= 1, true);
  assert.equal(report.aiAnalysis.predictions.length, 1);
  assert.equal(
    report.findings.some((finding) => finding.category === "authentication"),
    true
  );
  assert.equal(
    report.findings.some((finding) => finding.category === "authorization"),
    true
  );
  assert.equal(
    report.findings.every((finding) => finding.validation?.disposition === "confirmed"),
    true
  );
  assert.equal(report.attackPaths[0]?.source, "ai");
  assert.equal(anonymousAdminAttempts, 2);
  assert.equal(privilegedAdminAttempts, 1);
});

test("AuthorizedSecurityTestingService expands into adaptive follow-up modules when findings justify deeper read-only coverage", async () => {
  const verificationRepository = createVerificationRepository();
  const runRepository = createRunRepository();
  const eventRepository = createEventRepository();
  const scanResult = createScanResult();
  scanResult.pages.push({
    url: "https://example.com/admin",
    title: "Admin",
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    linkCount: 1,
    sameOriginLinkCount: 1,
    externalLinkCount: 0,
    formCount: 0,
    loginFormCount: 0,
    externalFormActionCount: 0,
    insecurePasswordSubmitCount: 0,
    inlineScriptCount: 0,
    externalScriptCount: 0,
    thirdPartyScriptCount: 0,
    mixedContentCount: 0,
    directoryListingDetected: false
  });

  const verification = await verificationRepository.create({
    workspaceId: "workspace-1",
    organizationId: "org-1",
    requestedByUserId: "user-1",
    hostname: "example.com",
    method: "dns_txt",
    status: "verified",
    challengeToken: "token-4",
    challengeDetails: {
      requestedUrl: "https://example.com",
      recordName: "_cognexa-security-test.example.com",
      expectedValue: "cognexa-verification=token-4"
    },
    expiresAt: "2026-07-21T07:00:00.000Z",
    verifiedAt: "2026-06-21T07:00:00.000Z"
  } as never);

  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      createStructuredOutput: async () => {
        throw new Error("LLM unavailable in test");
      }
    } as never,
    verificationRepository as never,
    runRepository as never,
    eventRepository as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (input, init) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;
        const method = init?.method ?? "GET";
        const headers = init?.headers as Record<string, string> | undefined;
        const authorizationHeader =
          headers?.Authorization ?? headers?.authorization ?? "";

        if (method === "OPTIONS") {
          return new Response("", { status: 204 });
        }

        if (url === "https://example.com/admin") {
          if (
            authorizationHeader === "Bearer low" ||
            authorizationHeader === "Bearer high" ||
            authorizationHeader === ""
          ) {
            return new Response("<html><body>Admin dashboard</body></html>", {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8"
              }
            });
          }
        }

        if (url === "https://example.com/login") {
          return new Response("<html><body>Login form</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "set-cookie": "session=abc; Path=/; HttpOnly"
            }
          });
        }

        return new Response("<html><body>Home</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }) as never,
      now: () => new Date("2026-06-21T07:35:00.000Z")
    }
  );

  const report = await service.runAuthorizedSecurityTest(createActor(), {
    verificationId: verification.id as string,
    url: "https://example.com",
    modules: ["authentication"],
    maxPages: 4,
    maxRequests: 18,
    authProfiles: [
      {
        name: "low",
        role: "low_privilege",
        headers: {
          Authorization: "Bearer low"
        },
        cookies: {}
      },
      {
        name: "high",
        role: "high_privilege",
        headers: {
          Authorization: "Bearer high"
        },
        cookies: {}
      }
    ]
  });

  assert.equal(report.status, "completed");
  assert.equal(report.plan.some((step) => step.category === "authorization"), true);
  assert.equal(
    report.summary.adaptation?.followUpExecuted.includes("authorization"),
    true
  );
  assert.equal(report.summary.adaptation?.decisions[0]?.module, "authorization");
  assert.equal(
    report.findings.some((finding) => finding.category === "authentication"),
    true
  );
  assert.equal(
    report.findings.some((finding) => finding.category === "authorization"),
    true
  );
  assert.equal(
    report.summary.campaignStory?.sections.some(
      (section) =>
        section.id === "adapt" && section.narrative.includes("authorization")
    ),
    true
  );
});

test("AuthorizedSecurityTestingService performs deep read-only API security checks", async () => {
  const verificationRepository = createVerificationRepository();
  const runRepository = createRunRepository();
  const eventRepository = createEventRepository();
  const scanResult = createScanResult();
  scanResult.cookies.total = 1;
  scanResult.cookies.missingSameSite = 1;
  scanResult.exposures = {
    probedEndpoints: 6,
    publicApiDocs: 1,
    publicApiEndpoints: 5,
    publicDatabaseInterfaces: 0,
    publicInternalServices: 0,
    sensitiveFiles: 0,
    endpoints: [
      {
        url: "https://example.com/openapi.json",
        kind: "api_documentation",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["public-schema"]
      },
      {
        url: "https://example.com/api/admin",
        kind: "api_endpoint",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["admin-route"]
      },
      {
        url: "https://example.com/api/profile",
        kind: "api_endpoint",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["profile-route"]
      },
      {
        url: "https://example.com/api/users/1",
        kind: "api_endpoint",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["user-object-route"]
      },
      {
        url: "https://example.com/api/search?q=1",
        kind: "api_endpoint",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["search-route"]
      },
      {
        url: "https://example.com/api/redirect?next=/dashboard",
        kind: "api_endpoint",
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        evidence: ["redirect-route"]
      }
    ]
  };

  const verification = await verificationRepository.create({
    workspaceId: "workspace-1",
    organizationId: "org-1",
    requestedByUserId: "user-1",
    hostname: "example.com",
    method: "dns_txt",
    status: "verified",
    challengeToken: "token-3",
    challengeDetails: {
      requestedUrl: "https://example.com",
      recordName: "_cognexa-security-test.example.com",
      expectedValue: "cognexa-verification=token-3"
    },
    expiresAt: "2026-07-21T07:00:00.000Z",
    verifiedAt: "2026-06-21T07:00:00.000Z"
  } as never);

  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      createStructuredOutput: async () => {
        throw new Error("LLM unavailable in test");
      }
    } as never,
    verificationRepository as never,
    runRepository as never,
    eventRepository as never,
    {
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (input, init) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;
        const method = init?.method ?? "GET";
        const headers = init?.headers as Record<string, string> | undefined;
        const authorizationHeader =
          headers?.Authorization ?? headers?.authorization ?? "";

        if (method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "access-control-allow-origin": "https://trusted.example.com"
            }
          });
        }

        if (url === "https://example.com/openapi.json") {
          return new Response(
            JSON.stringify({
              openapi: "3.1.0",
              components: {
                securitySchemes: {
                  sessionCookie: {
                    type: "apiKey",
                    in: "cookie",
                    name: "session"
                  }
                }
              },
              paths: {
                "/api/admin": {
                  get: {
                    summary: "Admin data"
                  }
                },
                "/api/users/{id}": {
                  get: {
                    summary: "User details"
                  },
                  patch: {
                    requestBody: {
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              role: {
                                type: "string"
                              },
                              isAdmin: {
                                type: "boolean"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8"
              }
            }
          );
        }

        if (url === "https://example.com/api/profile") {
          return new Response(
            JSON.stringify({
              email: "owner@example.com",
              role: "owner",
              token: "redacted-token"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8"
              }
            }
          );
        }

        if (url === "https://example.com/api/admin") {
          return new Response(
            JSON.stringify({
              admin: true,
              permissions: ["manage_users"]
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8"
              }
            }
          );
        }

        if (
          url === "https://example.com/api/orders/1" ||
          url === "https://example.com/api/projects/1"
        ) {
          return new Response("not-found", {
            status: 404,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/api/users/1") {
          if (authorizationHeader === "Bearer high" || authorizationHeader === "Bearer low") {
            return new Response(
              JSON.stringify({
                id: 1,
                email: "customer@example.com",
                role: "member"
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json; charset=utf-8"
                }
              }
            );
          }

          return new Response("forbidden", {
            status: 403,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/api/users") {
          return new Response("forbidden", {
            status: 403,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/api/search?q=1") {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          });
        }

        if (url.includes("https://example.com/api/search?q=1%27")) {
          return new Response("SQL syntax error near ''", {
            status: 500,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          });
        }

        if (url.startsWith("https://example.com/api/redirect?next=")) {
          const nextValue = decodeURIComponent(url.split("next=")[1] ?? "");
          return new Response(JSON.stringify({ next: nextValue }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/api" || url === "https://example.com/api/v1") {
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          });
        }

        return new Response("<html><body>Home</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }) as never,
      now: () => new Date("2026-06-21T07:45:00.000Z")
    }
  );

  const report = await service.runAuthorizedSecurityTest(createActor(), {
    verificationId: verification.id as string,
    url: "https://example.com",
    modules: ["api_security"],
    maxPages: 4,
    maxRequests: 40,
    authProfiles: [
      {
        name: "low",
        role: "low_privilege",
        headers: {
          Authorization: "Bearer low"
        },
        cookies: {}
      },
      {
        name: "high",
        role: "high_privilege",
        headers: {
          Authorization: "Bearer high"
        },
        cookies: {}
      }
    ]
  });

  const apiFindings = report.findings.filter(
    (finding) => finding.category === "api_security"
  );
  const vulnerabilityTypes = new Set(
    apiFindings
      .map((finding) => finding.apiDetails?.vulnerabilityType)
      .filter((value): value is string => Boolean(value))
  );

  assert.equal(report.status, "completed");
  assert.equal(report.summary.planSource, "deterministic");
  assert.equal(report.summary.requestsSent > 0, true);
  assert.equal(vulnerabilityTypes.has("mass_assignment"), true);
  assert.equal(vulnerabilityTypes.has("csrf"), true);
  assert.equal(vulnerabilityTypes.has("data_leakage"), true);
  assert.equal(vulnerabilityTypes.has("auth_bypass"), true);
  assert.equal(vulnerabilityTypes.has("idor"), true);
  assert.equal(vulnerabilityTypes.has("sql_injection"), true);
  assert.equal(vulnerabilityTypes.has("xss"), true);
  assert.equal(vulnerabilityTypes.has("rate_limiting"), true);
  assert.equal(
    apiFindings.some((finding) => finding.apiDetails?.endpoint.includes("/api/profile")),
    true
  );
  assert.equal(
    apiFindings.some((finding) => finding.validation?.source === "heuristic"),
    true
  );
});

test("AuthorizedSecurityTestingService auto-verifies development local targets only when explicit local mode is enabled", async () => {
  const verificationRepository = createVerificationRepository();
  const runRepository = createRunRepository();
  const eventRepository = createEventRepository();
  const scanResult = createScanResult();
  scanResult.requestedUrl = "http://localhost:3000";
  scanResult.finalUrl = "http://localhost:3000";
  scanResult.hostname = "localhost";
  scanResult.pages = [
    {
      url: "http://localhost:3000",
      title: "Home",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      linkCount: 1,
      sameOriginLinkCount: 1,
      externalLinkCount: 0,
      formCount: 0,
      loginFormCount: 0,
      externalFormActionCount: 0,
      insecurePasswordSubmitCount: 0,
      inlineScriptCount: 0,
      externalScriptCount: 0,
      thirdPartyScriptCount: 0,
      mixedContentCount: 0,
      directoryListingDetected: false
    },
    {
      url: "http://localhost:3000/login",
      title: "Login",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      linkCount: 0,
      sameOriginLinkCount: 0,
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
  ];

  const service = new AuthorizedSecurityTestingService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      scanWebsite: async () => scanResult
    } as never,
    {
      createStructuredOutput: async () => {
        throw new Error("LLM unavailable in test");
      }
    } as never,
    verificationRepository as never,
    runRepository as never,
    eventRepository as never,
    {
      allowDevelopmentLocalTargets: true,
      defaultProvider: "qwen",
      defaultModel: "qwen2.5-coder",
      lookupHost: (async () => [
        {
          address: "127.0.0.1",
          family: 4
        }
      ]) as never,
      fetchImpl: (async (input) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;

        if (url === "http://localhost:3000/login") {
          return new Response("<html><body>Login form</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store"
            }
          });
        }

        return new Response("<html><body>Home</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }) as never,
      now: () => new Date("2026-06-21T08:00:00.000Z")
    }
  );

  const verification = await service.startDomainVerification(createActor(), {
    target: "http://localhost:3000",
    method: "dns_txt"
  });
  const checked = await service.checkDomainVerification(
    createActor(),
    verification.id
  );
  const report = await service.runAuthorizedSecurityTest(createActor(), {
    verificationId: verification.id,
    url: "http://localhost:3000",
    modules: ["session_management"],
    maxPages: 2,
    maxRequests: 10
  });

  assert.equal(verification.status, "verified");
  assert.equal(checked.status, "verified");
  assert.equal(report.status, "completed");
  assert.equal(report.ownership.hostname, "localhost");
  assert.equal(
    report.guardrails[0]?.includes("Development local-target mode is active"),
    true
  );
});
