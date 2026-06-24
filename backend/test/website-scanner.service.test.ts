import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { WebsiteScannerService } from "../src/services/website-scanner/website-scanner.service";

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

test("WebsiteScannerService reports passive website hardening gaps", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
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

        if (url === "http://example.com/") {
          return new Response("", {
            status: 301,
            headers: {
              location: "https://example.com/"
            }
          });
        }

        if (url === "https://example.com/") {
          return new Response(
            `
              <html>
                <head>
                  <title>Example Root</title>
                  <meta name="generator" content="ExampleCMS 3.2.1" />
                </head>
                <body>
                  <a href="/login">Login</a>
                  <script src="http://cdn.example.com/app.js"></script>
                  <form action="http://example.com/login" method="post">
                    <input type="password" name="password" />
                  </form>
                </body>
              </html>
            `,
            {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "set-cookie": "sessionId=abc123; Path=/; HttpOnly",
                "x-powered-by": "Express/4.18.2",
                server: "nginx/1.25.4"
              }
            }
          );
        }

        if (url === "https://example.com/login") {
          return new Response(
            `
              <html>
                <head>
                  <title>Login</title>
                </head>
                <body>
                  <form action="http://example.com/session" method="post">
                    <input type="password" name="password" />
                  </form>
                </body>
              </html>
            `,
            {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8"
              }
            }
          );
        }

        if (url === "https://example.com/robots.txt") {
          return new Response("User-agent: *\nDisallow:", {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/.well-known/security.txt") {
          return new Response("Contact: mailto:security@example.com", {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/sitemap.xml") {
          return new Response("", {
            status: 404,
            headers: {
              "content-type": "application/xml; charset=utf-8"
            }
          });
        }

        if (url === "https://example.com/openapi.json") {
          return new Response(
            JSON.stringify({
              openapi: "3.1.0",
              paths: {
                "/users": {}
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

        if (url === "https://example.com/adminer.php") {
          return new Response(
            `
              <html>
                <head>
                  <title>Adminer</title>
                </head>
                <body>
                  <h1>Login - Adminer</h1>
                </body>
              </html>
            `,
            {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8"
              }
            }
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "example.com",
    maxPages: 2
  });

  assert.equal(result.pagesScanned, 2);
  assert.equal(result.requestedUrl, "https://example.com/");
  assert.equal(result.cookies.missingSecure, 1);
  assert.equal(result.surface.totalForms, 2);
  assert.equal(result.surface.mixedContentReferences, 3);
  assert.equal(result.exposures.publicApiDocs, 1);
  assert.equal(result.exposures.publicDatabaseInterfaces, 1);
  assert.equal(result.resources[0]?.status, "present");
  assert.equal(result.resources[1]?.status, "present");
  assert.equal(result.resources[2]?.status, "missing");
  assert.equal(result.summary.riskLevel, "critical");
  assert.ok(result.summary.recommendedActions.length > 0);
  assert.ok(
    result.findings.some((finding) => finding.title === "Strict-Transport-Security is missing")
  );
  assert.ok(
    result.findings.some((finding) => finding.title === "Mixed content references detected")
  );
  assert.ok(
    result.findings.some((finding) => finding.title === "Password form submits insecurely")
  );
  assert.ok(
    result.findings.some((finding) => finding.id.startsWith("exposure-api-docs-"))
  );
  assert.ok(
    result.findings.some((finding) =>
      finding.id.startsWith("exposure-database-interface-")
    )
  );
});

test("WebsiteScannerService prefers a rendered browser crawl when available", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      browserCrawler: {
        crawl: async () => ({
          browserEngine: "Chrome/137.0.0.0",
          finalUrl: "https://rendered.example.com/",
          rootHeaders: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "x-content-type-options": "nosniff",
            "referrer-policy": "strict-origin-when-cross-origin",
            "permissions-policy": "camera=(), microphone=()"
          },
          cookies: [
            {
              name: "session",
              secure: true,
              httpOnly: true,
              sameSite: "Lax"
            }
          ],
          pages: [
            {
              url: "https://rendered.example.com/",
              statusCode: 200,
              contentType: "text/html; charset=utf-8",
              html: `
                <html>
                  <head>
                    <title>Rendered Home</title>
                  </head>
                  <body>
                    <a href="/login">Login</a>
                    <script src="https://cdn.rendered.example.com/app.js"></script>
                  </body>
                </html>
              `
            },
            {
              url: "https://rendered.example.com/login",
              statusCode: 200,
              contentType: "text/html; charset=utf-8",
              html: `
                <html>
                  <head>
                    <title>Login</title>
                  </head>
                  <body>
                    <form action="https://rendered.example.com/session" method="post">
                      <input type="password" name="password" />
                    </form>
                  </body>
                </html>
              `
            }
          ],
          warnings: [],
          attemptedPages: 2,
          failedPages: 0,
          skippedCrossOriginPages: 0,
          skippedNonHtmlPages: 0,
          duplicatePagesSkipped: 0
        })
      },
      fetchImpl: (async (input) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;

        if (url === "http://rendered.example.com/") {
          return new Response("", {
            status: 301,
            headers: {
              location: "https://rendered.example.com/"
            }
          });
        }

        if (url === "https://rendered.example.com/") {
          return new Response(
            `
              <html>
                <head>
                  <title>Just a moment...</title>
                </head>
                <body>
                  <p>Enable JavaScript and cookies to continue.</p>
                </body>
              </html>
            `,
            {
              status: 403,
              headers: {
                "content-type": "text/html; charset=utf-8",
                server: "cloudflare"
              }
            }
          );
        }

        if (url === "https://rendered.example.com/robots.txt") {
          return new Response("User-agent: *\nAllow: /", {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://rendered.example.com/.well-known/security.txt") {
          return new Response("", {
            status: 404,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        if (url === "https://rendered.example.com/sitemap.xml") {
          return new Response("", {
            status: 200,
            headers: {
              "content-type": "application/xml; charset=utf-8"
            }
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "rendered.example.com",
    maxPages: 3
  });

  assert.equal(result.analysis.mode, "browser");
  assert.equal(result.analysis.browserSucceeded, true);
  assert.equal(result.analysis.browserEngine, "Chrome/137.0.0.0");
  assert.equal(result.pagesScanned, 2);
  assert.equal(result.surface.totalForms, 1);
  assert.equal(result.resources[0]?.status, "present");
  assert.equal(result.resources[1]?.status, "missing");
  assert.equal(result.resources[2]?.status, "present");
  assert.ok(
    result.summary.strengths.some((entry) => /rendered browser crawl/i.test(entry))
  );
  assert.ok(
    !result.findings.some((finding) => finding.id === "content-access-challenge")
  );
});

test("WebsiteScannerService falls back to a rendered browser crawl when the initial fetch fails", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      browserCrawler: {
        crawl: async () => ({
          browserEngine: "Chrome/137.0.0.0",
          finalUrl: "https://browser-fallback.example/",
          rootHeaders: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'self'",
            "strict-transport-security": "max-age=31536000; includeSubDomains"
          },
          cookies: [],
          pages: [
            {
              url: "https://browser-fallback.example/",
              statusCode: 200,
              contentType: "text/html; charset=utf-8",
              html: `
                <html>
                  <head>
                    <title>Browser Fallback</title>
                  </head>
                  <body>
                    <a href="/account">Account</a>
                  </body>
                </html>
              `
            },
            {
              url: "https://browser-fallback.example/account",
              statusCode: 200,
              contentType: "text/html; charset=utf-8",
              html: `
                <html>
                  <head>
                    <title>Account</title>
                  </head>
                  <body>
                    <p>Secure area</p>
                  </body>
                </html>
              `
            }
          ],
          warnings: [],
          attemptedPages: 2,
          failedPages: 0,
          skippedCrossOriginPages: 0,
          skippedNonHtmlPages: 0,
          duplicatePagesSkipped: 0
        })
      },
      fetchImpl: (async (input) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;

        if (url === "https://browser-fallback.example/") {
          const error = new Error("fetch failed");
          Object.assign(error, {
            cause: {
              code: "ECONNRESET",
              message: "socket hang up"
            }
          });
          throw error;
        }

        if (
          url === "https://browser-fallback.example/robots.txt" ||
          url === "https://browser-fallback.example/.well-known/security.txt" ||
          url === "https://browser-fallback.example/sitemap.xml" ||
          url === "http://browser-fallback.example/"
        ) {
          throw new Error("Resource probe unavailable");
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "browser-fallback.example",
    maxPages: 2
  });

  assert.equal(result.analysis.mode, "browser");
  assert.equal(result.analysis.browserSucceeded, true);
  assert.equal(result.pagesScanned, 2);
  assert.equal(result.finalUrl, "https://browser-fallback.example/");
  assert.ok(
    result.warnings.some((warning) =>
      /initial http request could not be completed, so the report used a rendered browser crawl instead/i.test(
        warning
      )
    )
  );
  assert.ok(
    result.warnings.some((warning) => /remote server reset the connection/i.test(warning))
  );
});

test("WebsiteScannerService records TLS certificate trust failures while continuing with a browser crawl", async () => {
  let ignoreHttpsErrorsUsed = false;

  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      lookupHost: (async () => [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]) as never,
      browserCrawler: {
        crawl: async (input) => {
          ignoreHttpsErrorsUsed = input.ignoreHttpsErrors === true;

          return {
            browserEngine: "Chrome/137.0.0.0",
            finalUrl: "https://bad-cert.example/",
            rootHeaders: {
              "content-type": "text/html; charset=utf-8"
            },
            cookies: [],
            pages: [
              {
                url: "https://bad-cert.example/",
                statusCode: 200,
                contentType: "text/html; charset=utf-8",
                html: `
                  <html>
                    <head>
                      <title>Bad Cert</title>
                    </head>
                    <body>
                      <a href="/account">Account</a>
                    </body>
                  </html>
                `
              }
            ],
            warnings: [],
            attemptedPages: 1,
            failedPages: 0,
            skippedCrossOriginPages: 0,
            skippedNonHtmlPages: 0,
            duplicatePagesSkipped: 0
          };
        }
      },
      fetchImpl: (async (input) => {
        const url =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;

        if (url === "https://bad-cert.example/") {
          const error = new Error("fetch failed");
          Object.assign(error, {
            cause: {
              code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
              message: "unable to verify the first certificate"
            }
          });
          throw error;
        }

        if (
          url === "https://bad-cert.example/robots.txt" ||
          url === "https://bad-cert.example/.well-known/security.txt" ||
          url === "https://bad-cert.example/sitemap.xml" ||
          url === "http://bad-cert.example/"
        ) {
          throw new Error("Resource probe unavailable");
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "bad-cert.example",
    maxPages: 2
  });

  assert.equal(ignoreHttpsErrorsUsed, true);
  assert.equal(result.analysis.mode, "browser");
  assert.equal(result.transport.finalProtocol, "https");
  assert.equal(result.transport.certificateTrusted, false);
  assert.ok(
    result.findings.some((finding) => finding.id === "transport-invalid-tls-certificate")
  );
  assert.ok(
    result.warnings.some((warning) =>
      /continued despite a tls certificate validation failure/i.test(warning)
    )
  );
});

test("WebsiteScannerService returns a limited report when TLS validation fails and browser fallback is unavailable", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
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

        if (url === "https://limited-cert.example/") {
          const error = new Error("fetch failed");
          Object.assign(error, {
            cause: {
              code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
              message: "unable to verify the first certificate"
            }
          });
          throw error;
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "limited-cert.example",
    maxPages: 2
  });

  assert.equal(result.pagesScanned, 0);
  assert.equal(result.transport.finalProtocol, "https");
  assert.equal(result.transport.certificateTrusted, false);
  assert.equal(result.grade, "F");
  assert.ok(
    result.findings.some((finding) => finding.id === "transport-invalid-tls-certificate")
  );
  assert.ok(
    result.warnings.some((warning) => /tls validation blocked content retrieval/i.test(warning))
  );
});

test("WebsiteScannerService returns a limited report for access challenge pages", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      lookupHost: (async () => [
        {
          address: "151.101.193.69",
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

        if (url === "http://blocked.com/") {
          return new Response("", {
            status: 301,
            headers: {
              location: "https://blocked.com/"
            }
          });
        }

        if (url === "https://blocked.com/") {
          return new Response(
            `
              <html>
                <head>
                  <title>Just a moment...</title>
                </head>
                <body>
                  <h1>Please wait while we verify you are human</h1>
                  <p>Enable JavaScript and cookies to continue.</p>
                </body>
              </html>
            `,
            {
              status: 403,
              headers: {
                "content-type": "text/html; charset=utf-8",
                server: "cloudflare"
              }
            }
          );
        }

        if (
          url === "https://blocked.com/robots.txt" ||
          url === "https://blocked.com/.well-known/security.txt" ||
          url === "https://blocked.com/sitemap.xml"
        ) {
          return new Response("", {
            status: 404,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "blocked.com",
    maxPages: 4
  });

  assert.equal(result.pagesScanned, 1);
  assert.equal(result.crawl.scannedPages, 1);
  assert.equal(result.pages[0]?.statusCode, 403);
  assert.match(result.summary.headline, /anti-bot or access challenge/i);
  assert.ok(
    result.warnings.some((warning) => /anti-bot or access challenge/i.test(warning))
  );
  assert.ok(
    result.findings.some((finding) => finding.id === "content-access-challenge")
  );
  assert.ok(
    result.findings.some((finding) => finding.id === "content-root-http-403")
  );
  assert.ok(result.summary.recommendedActions.length > 0);
});

test("WebsiteScannerService blocks private targets", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      lookupHost: (async () => [
        {
          address: "127.0.0.1",
          family: 4
        }
      ]) as never,
      fetchImpl: (async () => {
        throw new Error("fetch should not be called for blocked targets");
      }) as typeof fetch
    }
  );

  await assert.rejects(
    service.scanWebsite(createActor(), {
      url: "http://127.0.0.1"
    }),
    /blocked private range/
  );
});

test("WebsiteScannerService allows private targets in explicit development local mode", async () => {
  const service = new WebsiteScannerService(
    {
      assertPermission: async () => undefined
    } as never,
    {
      evaluatePolicy: async () => ({
        decision: "allow"
      })
    } as never,
    {
      allowDevelopmentLocalTargets: true,
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

        if (url === "http://127.0.0.1:3000/") {
          return new Response(
            `
              <html>
                <head>
                  <title>Local App</title>
                </head>
                <body>
                  <a href="/login">Login</a>
                </body>
              </html>
            `,
            {
              status: 200,
              headers: {
                "content-type": "text/html; charset=utf-8"
              }
            }
          );
        }

        if (url === "http://127.0.0.1:3000/login") {
          return new Response("<html><body>Login</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store"
            }
          });
        }

        return new Response("", {
          status: 404,
          headers: {
            "content-type": "text/plain; charset=utf-8"
          }
        });
      }) as typeof fetch
    }
  );

  const result = await service.scanWebsite(createActor(), {
    url: "http://127.0.0.1:3000",
    maxPages: 2
  });

  assert.equal(result.requestedUrl, "http://127.0.0.1:3000/");
  assert.equal(result.pagesScanned >= 1, true);
});
