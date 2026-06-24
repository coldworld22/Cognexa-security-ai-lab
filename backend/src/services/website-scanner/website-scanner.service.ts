import { lookup } from "dns/promises";
import { isIP } from "net";

import { AccessContext } from "../../authorization/authorization.types";
import { AppError } from "../../utils/app-error";
import { AuthorizationService } from "../authorization/authorization.service";
import { PolicyService } from "../policy/policy.service";
import {
  BrowserCrawlResult,
  BrowserCrawler,
  BrowserObservedCookie
} from "./headless-browser-crawler";

export type WebsiteFindingSeverity = "info" | "low" | "medium" | "high";
export type WebsiteFindingCategory =
  | "transport"
  | "headers"
  | "cookies"
  | "forms"
  | "content"
  | "cors"
  | "exposure";

export interface WebsiteScanRequest {
  url: string;
  maxPages?: number;
}

export interface WebsiteScanFinding {
  id: string;
  severity: WebsiteFindingSeverity;
  category: WebsiteFindingCategory;
  title: string;
  summary: string;
  remediation: string;
  pageUrl?: string;
  evidence: string[];
}

export interface WebsiteScannedPage {
  url: string;
  title: string;
  statusCode: number;
  contentType: string;
  linkCount: number;
  sameOriginLinkCount: number;
  externalLinkCount: number;
  formCount: number;
  loginFormCount: number;
  externalFormActionCount: number;
  insecurePasswordSubmitCount: number;
  inlineScriptCount: number;
  externalScriptCount: number;
  thirdPartyScriptCount: number;
  mixedContentCount: number;
  directoryListingDetected: boolean;
}

export interface WebsiteScanSummary {
  riskLevel: "low" | "medium" | "high" | "critical";
  headline: string;
  strengths: string[];
  topRisks: string[];
  recommendedActions: string[];
}

export interface WebsiteScanCrawlStats {
  attemptedPages: number;
  scannedPages: number;
  failedPages: number;
  skippedCrossOriginPages: number;
  skippedNonHtmlPages: number;
  duplicatePagesSkipped: number;
  discoveredSameOriginPages: number;
  discoveredExternalLinks: number;
}

export interface WebsiteScanSurfaceMetrics {
  totalForms: number;
  loginForms: number;
  externalFormActions: number;
  insecurePasswordSubmissions: number;
  inlineScripts: number;
  externalScripts: number;
  thirdPartyScripts: number;
  mixedContentReferences: number;
  directoryListings: number;
}

export type WebsiteScanExposureKind =
  | "api_documentation"
  | "api_endpoint"
  | "database_interface"
  | "internal_service"
  | "sensitive_file";

export interface WebsiteScanExposedEndpoint {
  url: string;
  kind: WebsiteScanExposureKind;
  statusCode: number;
  contentType: string;
  evidence: string[];
}

export interface WebsiteScanExposureSummary {
  probedEndpoints: number;
  publicApiDocs: number;
  publicApiEndpoints: number;
  publicDatabaseInterfaces: number;
  publicInternalServices: number;
  sensitiveFiles: number;
  endpoints: WebsiteScanExposedEndpoint[];
}

export interface WebsiteScanResourceCheck {
  name: "robots.txt" | "security.txt" | "sitemap.xml";
  path: string;
  status: "present" | "missing" | "error";
  statusCode: number | null;
  finalUrl?: string;
}

export interface WebsiteScanFingerprint {
  source: "server" | "x-powered-by" | "generator";
  value: string;
  sanitizedValue: string;
}

export interface WebsiteScanResult {
  scannedAt: string;
  requestedUrl: string;
  finalUrl: string;
  hostname: string;
  pagesScanned: number;
  maxPages: number;
  sameOriginPagesDiscovered: number;
  securityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findingCounts: Record<WebsiteFindingSeverity, number>;
  analysis: {
    mode: "http" | "browser";
    browserAttempted: boolean;
    browserSucceeded: boolean;
    browserEngine: string | null;
  };
  summary: WebsiteScanSummary;
  warnings: string[];
  transport: {
    initialProtocol: "http" | "https";
    finalProtocol: "http" | "https";
    redirectedToHttps: boolean;
    hstsEnabled: boolean;
    certificateTrusted: boolean;
  };
  headers: {
    contentSecurityPolicy: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    referrerPolicy: string | null;
    permissionsPolicy: string | null;
    crossOriginOpenerPolicy: string | null;
    accessControlAllowOrigin: string | null;
    accessControlAllowCredentials: string | null;
    server: string | null;
    xPoweredBy: string | null;
  };
  cookies: {
    total: number;
    missingSecure: number;
    missingHttpOnly: number;
    missingSameSite: number;
  };
  crawl: WebsiteScanCrawlStats;
  surface: WebsiteScanSurfaceMetrics;
  exposures: WebsiteScanExposureSummary;
  resources: WebsiteScanResourceCheck[];
  fingerprints: WebsiteScanFingerprint[];
  pages: WebsiteScannedPage[];
  findings: WebsiteScanFinding[];
}

interface CookieAssessment {
  total: number;
  missingSecure: number;
  missingHttpOnly: number;
  missingSameSite: number;
}

interface PageAnalysis extends WebsiteScannedPage {
  links: URL[];
  generator: string | null;
}

interface RedirectedResponse {
  finalUrl: URL;
  response: Response;
}

interface CrawlOutcome {
  pages: PageAnalysis[];
  warnings: string[];
  stats: WebsiteScanCrawlStats;
}

interface RootResponseAssessment {
  warnings: string[];
  suppressDeepCrawl: boolean;
  accessChallengeDetected: boolean;
}

interface ExposureCandidate {
  url: URL;
  kindHint: WebsiteScanExposureKind;
}

interface ExposureAssessment {
  summary: WebsiteScanExposureSummary;
  findings: WebsiteScanFinding[];
}

interface ResponsePreview {
  preview: string;
  contentLength: number | null;
  truncated: boolean;
}

interface ExposureObservation {
  endpoint: WebsiteScanExposedEndpoint;
  finding: WebsiteScanFinding;
}

interface WebsiteScannerServiceOptions {
  allowDevelopmentLocalTargets?: boolean;
  fetchImpl?: typeof fetch;
  lookupHost?: typeof lookup;
  browserCrawler?: BrowserCrawler;
}

export class WebsiteScannerService {
  private readonly allowDevelopmentLocalTargets: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly lookupHost: typeof lookup;
  private readonly browserCrawler?: BrowserCrawler;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly policy: PolicyService,
    options: WebsiteScannerServiceOptions = {}
  ) {
    this.allowDevelopmentLocalTargets =
      options.allowDevelopmentLocalTargets === true;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookupHost = options.lookupHost ?? lookup;
    this.browserCrawler = options.browserCrawler;
  }

  async scanWebsite(
    actor: AccessContext,
    input: WebsiteScanRequest
  ): Promise<WebsiteScanResult> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.website.scan",
      action: "scan_website",
      reason: "Website scanning requires 'admin_dashboard' permission"
    });

    const requestedUrl = this.normalizeRequestedUrl(input.url);
    const maxPages = this.normalizeMaxPages(input.maxPages);

    await this.policy.evaluatePolicy({
      actor,
      action: "admin.website_scan.execute",
      categories: ["external_url_access", "vulnerability_analysis"],
      content: "Passive website security audit",
      url: requestedUrl.toString(),
      metadata: {
        passiveOnly: true,
        sameOriginOnly: true,
        maxPages
      }
    });

    await this.assertSafePublicUrl(requestedUrl);

    let root: RedirectedResponse | null = null;
    let rootFetchError: AppError | null = null;

    try {
      root = await this.fetchFollowingRedirects(requestedUrl, true, {
        allowErrorStatus: true
      });
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      rootFetchError = error;
    }

    const browserAttemptTarget =
      root?.finalUrl ??
      (requestedUrl.protocol === "http:" ? this.toHttpsUrl(requestedUrl) : requestedUrl);
    const rootTlsCertificateValidationError =
      this.describeTlsCertificateValidationFailure(rootFetchError);
    const browserAttempt = await this.tryBrowserAssistedCrawl(
      browserAttemptTarget,
      maxPages,
      {
        ignoreHttpsErrors: Boolean(rootTlsCertificateValidationError)
      }
    );

    let effectiveFinalUrl: URL;
    let effectiveRootPage: PageAnalysis;
    let effectiveRootResponseAssessment: RootResponseAssessment;
    let effectiveHeaders: WebsiteScanResult["headers"];
    let effectiveCookies: CookieAssessment;
    let crawl: CrawlOutcome;
    let analysis: WebsiteScanResult["analysis"] = {
      mode: "http",
      browserAttempted: browserAttempt.attempted,
      browserSucceeded: false,
      browserEngine: null
    };

    if (root) {
      const finalUrl = root.finalUrl;
      const rootContentType = this.getContentType(root.response);

      if (!this.isHtmlLike(rootContentType)) {
        throw new AppError("Website scanner only supports HTML pages.", 415, {
          url: finalUrl.toString(),
          contentType: rootContentType
        });
      }

      const rootHtml = await root.response.text();
      const rootPage = this.analyzePage({
        url: finalUrl,
        html: rootHtml,
        statusCode: root.response.status,
        contentType: rootContentType
      });
      const rootResponseAssessment = this.assessRootResponse({
        responseStatus: root.response.status,
        page: rootPage,
        html: rootHtml
      });

      effectiveFinalUrl = finalUrl;
      effectiveRootPage = rootPage;
      effectiveRootResponseAssessment = rootResponseAssessment;
      effectiveHeaders = this.extractRelevantHeaders(root.response.headers);
      effectiveCookies = this.assessCookies(
        root.response.headers,
        finalUrl.protocol === "https:"
      );
      crawl =
        rootResponseAssessment.suppressDeepCrawl
          ? this.createRootOnlyCrawlOutcome(rootPage, rootResponseAssessment.warnings)
          : await this.crawlSameOriginPages(finalUrl, maxPages, rootPage);

      if (browserAttempt.result) {
        const browserPages = browserAttempt.result.pages.map((page) =>
          this.analyzePage({
            url: new URL(page.url),
            html: page.html,
            statusCode: page.statusCode,
            contentType: page.contentType
          })
        );
        const browserRootPage = browserPages[0];
        if (!browserRootPage) {
          throw new AppError("Browser crawl did not return a root page.", 502);
        }

        effectiveFinalUrl = new URL(browserAttempt.result.finalUrl);
        effectiveRootPage = browserRootPage;
        effectiveRootResponseAssessment = this.assessRootResponse({
          responseStatus: browserRootPage.statusCode,
          page: browserRootPage,
          html: browserAttempt.result.pages[0]?.html ?? ""
        });
        effectiveHeaders = this.extractRelevantHeaders(
          this.headersFromRecord(browserAttempt.result.rootHeaders)
        );
        effectiveCookies = this.assessObservedCookies(
          browserAttempt.result.cookies,
          effectiveFinalUrl.protocol === "https:"
        );
        crawl = this.createCrawlOutcomeFromAnalyzedPages(browserPages, {
          warnings: this.mergeWarnings(
            browserAttempt.result.warnings,
            browserAttempt.warnings
          ),
          attemptedPages: browserAttempt.result.attemptedPages,
          failedPages: browserAttempt.result.failedPages,
          skippedCrossOriginPages: browserAttempt.result.skippedCrossOriginPages,
          skippedNonHtmlPages: browserAttempt.result.skippedNonHtmlPages,
          duplicatePagesSkipped: browserAttempt.result.duplicatePagesSkipped
        });
        analysis = {
          mode: "browser",
          browserAttempted: true,
          browserSucceeded: true,
          browserEngine: browserAttempt.result.browserEngine
        };
      } else if (browserAttempt.warnings.length > 0) {
        crawl = {
          ...crawl,
          warnings: this.mergeWarnings(browserAttempt.warnings, crawl.warnings)
        };
      }
    } else {
      if (!browserAttempt.result) {
        if (rootTlsCertificateValidationError) {
          return this.createTlsCertificateFailureReport({
            requestedUrl,
            maxPages,
            browserAttempt,
            reason: rootTlsCertificateValidationError,
            finalUrl:
              typeof this.asDetailsRecord(rootFetchError?.details).url === "string"
                ? String(this.asDetailsRecord(rootFetchError?.details).url)
                : browserAttemptTarget.toString()
          });
        }

        throw new AppError(
          rootFetchError?.message ?? "Failed to fetch website content.",
          rootFetchError?.statusCode ?? 502,
          {
            ...this.asDetailsRecord(rootFetchError?.details),
            browserFallbackWarnings: browserAttempt.warnings
          }
        );
      }

      const browserPages = browserAttempt.result.pages.map((page) =>
        this.analyzePage({
          url: new URL(page.url),
          html: page.html,
          statusCode: page.statusCode,
          contentType: page.contentType
        })
      );
      const browserRootPage = browserPages[0];
      if (!browserRootPage) {
        throw new AppError("Browser crawl did not return a root page.", 502);
      }

      effectiveFinalUrl = new URL(browserAttempt.result.finalUrl);
      effectiveRootPage = browserRootPage;
      effectiveRootResponseAssessment = this.assessRootResponse({
        responseStatus: browserRootPage.statusCode,
        page: browserRootPage,
        html: browserAttempt.result.pages[0]?.html ?? ""
      });
      effectiveHeaders = this.extractRelevantHeaders(
        this.headersFromRecord(browserAttempt.result.rootHeaders)
      );
      effectiveCookies = this.assessObservedCookies(
        browserAttempt.result.cookies,
        effectiveFinalUrl.protocol === "https:"
      );
      crawl = this.createCrawlOutcomeFromAnalyzedPages(browserPages, {
        warnings: this.mergeWarnings(
          [
            `The initial HTTP request could not be completed, so the report used a rendered browser crawl instead: ${this.describeRootFetchError(
              rootFetchError
            )}`
          ],
          browserAttempt.result.warnings,
          browserAttempt.warnings
        ),
        attemptedPages: browserAttempt.result.attemptedPages,
        failedPages: browserAttempt.result.failedPages,
        skippedCrossOriginPages: browserAttempt.result.skippedCrossOriginPages,
        skippedNonHtmlPages: browserAttempt.result.skippedNonHtmlPages,
        duplicatePagesSkipped: browserAttempt.result.duplicatePagesSkipped
      });
      analysis = {
        mode: "browser",
        browserAttempted: true,
        browserSucceeded: true,
        browserEngine: browserAttempt.result.browserEngine
      };
    }

    if (
      analysis.mode === "browser" &&
      effectiveRootResponseAssessment.warnings.length > 0
    ) {
      crawl = {
        ...crawl,
        warnings: this.mergeWarnings(
          effectiveRootResponseAssessment.warnings,
          crawl.warnings
        )
      };
    }

    const httpProbe = await this.inspectHttpRedirect(effectiveFinalUrl);
    const hstsEnabled =
      effectiveFinalUrl.protocol === "https:" &&
      Boolean(
        analysis.mode === "browser"
          ? this.headersFromRecord(browserAttempt.result?.rootHeaders ?? {}).get(
              "strict-transport-security"
            )
          : root?.response.headers.get("strict-transport-security")
      );
    const transport = {
      initialProtocol: requestedUrl.protocol === "https:" ? "https" : "http",
      finalProtocol: effectiveFinalUrl.protocol === "https:" ? "https" : "http",
      redirectedToHttps:
        requestedUrl.protocol === "http:"
          ? effectiveFinalUrl.protocol === "https:"
          : httpProbe.redirectedToHttps,
      hstsEnabled,
      certificateTrusted:
        effectiveFinalUrl.protocol === "https:"
          ? !browserAttempt.ignoreHttpsErrorsUsed
          : false
    } satisfies WebsiteScanResult["transport"];

    const resources = await this.checkCommonResources(effectiveFinalUrl);
    const fingerprints = this.collectFingerprints(effectiveHeaders, effectiveRootPage);
    const exposureAssessment =
      effectiveRootResponseAssessment.accessChallengeDetected ||
      effectiveRootPage.statusCode >= 400
        ? this.createEmptyExposureAssessment()
        : await this.inspectExposedServices(effectiveFinalUrl, crawl.pages);
    const findings = this.buildFindings({
      rootPage: effectiveRootPage,
      pages: crawl.pages,
      headers: effectiveHeaders,
      cookies: effectiveCookies,
      transport,
      rootAccessChallengeDetected: effectiveRootResponseAssessment.accessChallengeDetected,
      tlsCertificateValidationError: rootTlsCertificateValidationError,
      exposureFindings: exposureAssessment.findings
    });
    const findingCounts = this.countFindings(findings);
    const securityScore = this.calculateSecurityScore(findings);
    const surface = this.summarizeSurface(crawl.pages);
    const summary = this.buildSummary({
      findings,
      findingCounts,
      securityScore,
      transport,
      headers: effectiveHeaders,
      cookies: effectiveCookies,
      pages: crawl.pages,
      analysis,
      exposures: exposureAssessment.summary
    });

    return {
      scannedAt: new Date().toISOString(),
      requestedUrl: requestedUrl.toString(),
      finalUrl: effectiveFinalUrl.toString(),
      hostname: effectiveFinalUrl.hostname,
      pagesScanned: crawl.pages.length,
      maxPages,
      sameOriginPagesDiscovered: crawl.stats.discoveredSameOriginPages,
      securityScore,
      grade: this.scoreToGrade(securityScore),
      findingCounts,
      analysis,
      summary,
      warnings: crawl.warnings,
      transport,
      headers: effectiveHeaders,
      cookies: effectiveCookies,
      crawl: crawl.stats,
      surface,
      exposures: exposureAssessment.summary,
      resources,
      fingerprints,
      pages: crawl.pages,
      findings
    };
  }

  private normalizeRequestedUrl(rawUrl: string): URL {
    const value = rawUrl.trim();
    if (!value) {
      throw new AppError("A target URL is required.", 400);
    }

    const normalizedValue = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
      ? value
      : `https://${value}`;

    let parsed: URL;
    try {
      parsed = new URL(normalizedValue);
    } catch {
      throw new AppError("Invalid target URL.", 400, {
        url: value
      });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new AppError("Only http and https URLs are allowed.", 400, {
        protocol: parsed.protocol
      });
    }

    if (parsed.username || parsed.password) {
      throw new AppError("Credentials in URLs are not allowed.", 400);
    }

    parsed.hash = "";
    return parsed;
  }

  private normalizeMaxPages(value?: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 4;
    }

    return Math.max(1, Math.min(10, Math.trunc(value)));
  }

  private async crawlSameOriginPages(
    originUrl: URL,
    maxPages: number,
    rootPage: PageAnalysis
  ): Promise<CrawlOutcome> {
    const pages: PageAnalysis[] = [rootPage];
    const visited = new Set([this.canonicalizeUrl(originUrl)]);
    const queued = new Set<string>();
    const warnings: string[] = [];
    let failedPages = 0;
    let skippedCrossOriginPages = 0;
    let skippedNonHtmlPages = 0;
    let duplicatePagesSkipped = 0;
    const discoveredSameOriginPages = new Set<string>();
    const discoveredExternalLinks = new Set<string>();
    const queue = rootPage.links
      .filter((link) => link.origin === originUrl.origin)
      .map((link) => this.stripHash(link));

    for (const link of rootPage.links) {
      const canonical = this.canonicalizeUrl(link);
      if (link.origin === originUrl.origin) {
        discoveredSameOriginPages.add(canonical);
      } else {
        discoveredExternalLinks.add(canonical);
      }
    }

    for (const link of queue) {
      queued.add(this.canonicalizeUrl(link));
    }

    while (queue.length > 0 && pages.length < maxPages) {
      const next = queue.shift();
      if (!next) {
        continue;
      }

      const key = this.canonicalizeUrl(next);
      if (visited.has(key)) {
        duplicatePagesSkipped += 1;
        continue;
      }

      visited.add(key);

      try {
        const response = await this.fetchFollowingRedirects(next);
        if (response.finalUrl.origin !== originUrl.origin) {
          skippedCrossOriginPages += 1;
          this.pushWarning(
            warnings,
            `Skipped ${response.finalUrl.toString()} because it redirected to a different origin.`
          );
          continue;
        }

        const contentType = this.getContentType(response.response);
        if (!this.isHtmlLike(contentType)) {
          skippedNonHtmlPages += 1;
          continue;
        }

        const html = await response.response.text();
        const page = this.analyzePage({
          url: response.finalUrl,
          html,
          statusCode: response.response.status,
          contentType
        });
        pages.push(page);

        for (const link of page.links) {
          const normalized = this.stripHash(link);
          const normalizedKey = this.canonicalizeUrl(normalized);

          if (link.origin !== originUrl.origin) {
            discoveredExternalLinks.add(normalizedKey);
            continue;
          }

          discoveredSameOriginPages.add(normalizedKey);
          if (visited.has(normalizedKey) || queued.has(normalizedKey)) {
            continue;
          }

          queue.push(normalized);
          queued.add(normalizedKey);
        }
      } catch (error) {
        failedPages += 1;
        this.pushWarning(
          warnings,
          `Failed to scan ${next.toString()}: ${
            error instanceof Error ? error.message : "Unknown fetch error"
          }`
        );
        // Ignore follow-up page failures so the scanner can still return a report.
      }
    }

    return {
      pages,
      warnings,
      stats: {
        attemptedPages: visited.size,
        scannedPages: pages.length,
        failedPages,
        skippedCrossOriginPages,
        skippedNonHtmlPages,
        duplicatePagesSkipped,
        discoveredSameOriginPages: discoveredSameOriginPages.size,
        discoveredExternalLinks: discoveredExternalLinks.size
      }
    };
  }

  private async tryBrowserAssistedCrawl(
    url: URL,
    maxPages: number,
    options: {
      ignoreHttpsErrors?: boolean;
    } = {}
  ): Promise<{
    attempted: boolean;
    result: BrowserCrawlResult | null;
    warnings: string[];
    ignoreHttpsErrorsUsed: boolean;
  }> {
    if (!this.browserCrawler) {
      return {
        attempted: false,
        result: null,
        warnings: [],
        ignoreHttpsErrorsUsed: false
      };
    }

    try {
      return {
        attempted: true,
        result: await this.browserCrawler.crawl({
          url,
          maxPages,
          ignoreHttpsErrors: options.ignoreHttpsErrors
        }),
        warnings: options.ignoreHttpsErrors
          ? [
              "The browser-assisted crawl continued despite a TLS certificate validation failure, so content findings reflect what loaded after bypassing the browser certificate warning."
            ]
          : [],
        ignoreHttpsErrorsUsed: Boolean(options.ignoreHttpsErrors)
      };
    } catch (error) {
      return {
        attempted: true,
        result: null,
        warnings: [
          `Browser-assisted crawl was unavailable, so the report used HTTP-only analysis: ${
            error instanceof Error ? error.message : "Unknown browser error"
          }`
        ],
        ignoreHttpsErrorsUsed: Boolean(options.ignoreHttpsErrors)
      };
    }
  }

  private toHttpsUrl(url: URL): URL {
    const next = new URL(url.toString());
    next.protocol = "https:";
    return next;
  }

  private asDetailsRecord(details: unknown): Record<string, unknown> {
    return details && typeof details === "object" && !Array.isArray(details)
      ? { ...details }
      : {};
  }

  private describeRootFetchError(error: AppError | null): string {
    if (!error) {
      return "Unknown fetch failure";
    }

    const details = this.asDetailsRecord(error.details);
    return typeof details.reason === "string" && details.reason
      ? details.reason
      : error.message;
  }

  private describeTlsCertificateValidationFailure(error: AppError | null): string | null {
    if (!error) {
      return null;
    }

    const details = this.asDetailsRecord(error.details);
    if (details.kind === "tls_certificate_invalid") {
      return typeof details.reason === "string" && details.reason
        ? details.reason
        : "The website TLS certificate could not be validated.";
    }

    const reason = typeof details.reason === "string" ? details.reason : "";
    return /unable to verify the first certificate|tls certificate could not be validated|self[- ]signed|certificate.*expired|altname invalid|issuer certificate/i.test(
      reason
    )
      ? reason
      : null;
  }

  private createCrawlOutcomeFromAnalyzedPages(
    pages: PageAnalysis[],
    input: {
      warnings: string[];
      attemptedPages: number;
      failedPages: number;
      skippedCrossOriginPages: number;
      skippedNonHtmlPages: number;
      duplicatePagesSkipped: number;
    }
  ): CrawlOutcome {
    return {
      pages,
      warnings: [...input.warnings],
      stats: {
        attemptedPages: input.attemptedPages,
        scannedPages: pages.length,
        failedPages: input.failedPages,
        skippedCrossOriginPages: input.skippedCrossOriginPages,
        skippedNonHtmlPages: input.skippedNonHtmlPages,
        duplicatePagesSkipped: input.duplicatePagesSkipped,
        discoveredSameOriginPages: this.countSameOriginDiscovered(pages),
        discoveredExternalLinks: this.countExternalLinksDiscovered(pages)
      }
    };
  }

  private createTlsCertificateFailureReport(input: {
    requestedUrl: URL;
    maxPages: number;
    browserAttempt: {
      attempted: boolean;
      warnings: string[];
      ignoreHttpsErrorsUsed: boolean;
    };
    reason: string;
    finalUrl: string;
  }): WebsiteScanResult {
    const findings: WebsiteScanFinding[] = [
      {
        id: "transport-invalid-tls-certificate",
        severity: "high",
        category: "transport",
        title: "TLS certificate validation failed",
        summary:
          "The scanner could not establish a trusted HTTPS connection because the certificate chain for the public site could not be validated.",
        remediation:
          "Install a complete and trusted TLS certificate chain for the public hostname, including any required intermediate certificates, and confirm the certificate matches the deployed domain.",
        pageUrl: input.finalUrl,
        evidence: [input.reason]
      }
    ];
    const primaryFinding = findings[0]!;
    const findingCounts = this.countFindings(findings);
    const securityScore = 35;

    return {
      scannedAt: new Date().toISOString(),
      requestedUrl: input.requestedUrl.toString(),
      finalUrl: input.finalUrl,
      hostname: new URL(input.finalUrl).hostname,
      pagesScanned: 0,
      maxPages: input.maxPages,
      sameOriginPagesDiscovered: 0,
      securityScore,
      grade: this.scoreToGrade(securityScore),
      findingCounts,
      analysis: {
        mode: "http",
        browserAttempted: input.browserAttempt.attempted,
        browserSucceeded: false,
        browserEngine: null
      },
      summary: {
        riskLevel: "high",
        headline:
          "The passive scan could not continue because the public HTTPS certificate chain was not trusted by the scanner.",
        strengths: [],
        topRisks: [primaryFinding.title],
        recommendedActions: [primaryFinding.remediation]
      },
      warnings: this.mergeWarnings(
        [
          `TLS validation blocked content retrieval: ${input.reason}`,
          "Content inspection was limited until the public certificate chain can be trusted."
        ],
        input.browserAttempt.warnings
      ),
      transport: {
        initialProtocol: input.requestedUrl.protocol === "https:" ? "https" : "http",
        finalProtocol: "https",
        redirectedToHttps: false,
        hstsEnabled: false,
        certificateTrusted: false
      },
      headers: {
        contentSecurityPolicy: null,
        xFrameOptions: null,
        xContentTypeOptions: null,
        referrerPolicy: null,
        permissionsPolicy: null,
        crossOriginOpenerPolicy: null,
        accessControlAllowOrigin: null,
        accessControlAllowCredentials: null,
        server: null,
        xPoweredBy: null
      },
      cookies: {
        total: 0,
        missingSecure: 0,
        missingHttpOnly: 0,
        missingSameSite: 0
      },
      crawl: {
        attemptedPages: 0,
        scannedPages: 0,
        failedPages: 0,
        skippedCrossOriginPages: 0,
        skippedNonHtmlPages: 0,
        duplicatePagesSkipped: 0,
        discoveredSameOriginPages: 0,
        discoveredExternalLinks: 0
      },
      surface: {
        totalForms: 0,
        loginForms: 0,
        externalFormActions: 0,
        insecurePasswordSubmissions: 0,
        inlineScripts: 0,
        externalScripts: 0,
        thirdPartyScripts: 0,
        mixedContentReferences: 0,
        directoryListings: 0
      },
      exposures: this.createEmptyExposureSummary(),
      resources: [
        {
          name: "robots.txt",
          path: "/robots.txt",
          status: "error",
          statusCode: null
        },
        {
          name: "security.txt",
          path: "/.well-known/security.txt",
          status: "error",
          statusCode: null
        },
        {
          name: "sitemap.xml",
          path: "/sitemap.xml",
          status: "error",
          statusCode: null
        }
      ],
      fingerprints: [],
      pages: [],
      findings
    };
  }

  private createEmptyExposureSummary(): WebsiteScanExposureSummary {
    return {
      probedEndpoints: 0,
      publicApiDocs: 0,
      publicApiEndpoints: 0,
      publicDatabaseInterfaces: 0,
      publicInternalServices: 0,
      sensitiveFiles: 0,
      endpoints: []
    };
  }

  private createEmptyExposureAssessment(): ExposureAssessment {
    return {
      summary: this.createEmptyExposureSummary(),
      findings: []
    };
  }

  private async inspectExposedServices(
    originUrl: URL,
    pages: PageAnalysis[]
  ): Promise<ExposureAssessment> {
    const candidates = this.buildExposureCandidates(originUrl, pages);
    const endpoints: WebsiteScanExposedEndpoint[] = [];
    const findings: WebsiteScanFinding[] = [];

    for (const candidate of candidates) {
      const observation = await this.inspectExposureCandidate(originUrl, candidate);
      if (!observation) {
        continue;
      }

      endpoints.push(observation.endpoint);
      findings.push(observation.finding);
    }

    return {
      summary: {
        probedEndpoints: candidates.length,
        publicApiDocs: endpoints.filter((endpoint) => endpoint.kind === "api_documentation")
          .length,
        publicApiEndpoints: endpoints.filter((endpoint) => endpoint.kind === "api_endpoint")
          .length,
        publicDatabaseInterfaces: endpoints.filter(
          (endpoint) => endpoint.kind === "database_interface"
        ).length,
        publicInternalServices: endpoints.filter(
          (endpoint) => endpoint.kind === "internal_service"
        ).length,
        sensitiveFiles: endpoints.filter((endpoint) => endpoint.kind === "sensitive_file")
          .length,
        endpoints
      },
      findings
    };
  }

  private buildExposureCandidates(
    originUrl: URL,
    pages: PageAnalysis[]
  ): ExposureCandidate[] {
    const candidates = new Map<string, ExposureCandidate>();

    const pushCandidate = (url: URL | null, kindHint: WebsiteScanExposureKind) => {
      if (!url || url.origin !== originUrl.origin) {
        return;
      }

      const normalized = this.stripHash(url);
      const key = this.canonicalizeUrl(normalized);
      if (!candidates.has(key)) {
        candidates.set(key, {
          url: normalized,
          kindHint
        });
      }
    };

    for (const page of pages) {
      for (const link of page.links) {
        const kindHint = this.classifyExposureHintFromPath(link.pathname);
        if (kindHint) {
          pushCandidate(link, kindHint);
        }
      }
    }

    const fixedCandidates: Array<{
      path: string;
      kindHint: WebsiteScanExposureKind;
    }> = [
      {
        path: "/.env",
        kindHint: "sensitive_file"
      },
      {
        path: "/.env.production",
        kindHint: "sensitive_file"
      },
      {
        path: "/config.json",
        kindHint: "sensitive_file"
      },
      {
        path: "/openapi.json",
        kindHint: "api_documentation"
      },
      {
        path: "/swagger.json",
        kindHint: "api_documentation"
      },
      {
        path: "/v3/api-docs",
        kindHint: "api_documentation"
      },
      {
        path: "/graphql",
        kindHint: "api_documentation"
      },
      {
        path: "/graphiql",
        kindHint: "api_documentation"
      },
      {
        path: "/api/me",
        kindHint: "api_endpoint"
      },
      {
        path: "/api/users",
        kindHint: "api_endpoint"
      },
      {
        path: "/api/admin",
        kindHint: "api_endpoint"
      },
      {
        path: "/api/internal",
        kindHint: "api_endpoint"
      },
      {
        path: "/api/config",
        kindHint: "api_endpoint"
      },
      {
        path: "/actuator",
        kindHint: "internal_service"
      },
      {
        path: "/actuator/env",
        kindHint: "internal_service"
      },
      {
        path: "/metrics",
        kindHint: "internal_service"
      },
      {
        path: "/server-status",
        kindHint: "internal_service"
      },
      {
        path: "/phpmyadmin/",
        kindHint: "database_interface"
      },
      {
        path: "/adminer.php",
        kindHint: "database_interface"
      },
      {
        path: "/_cat/indices",
        kindHint: "database_interface"
      },
      {
        path: "/mongo-express/",
        kindHint: "database_interface"
      }
    ];

    for (const candidate of fixedCandidates) {
      pushCandidate(new URL(candidate.path, originUrl), candidate.kindHint);
    }

    return [...candidates.values()].slice(0, 24);
  }

  private classifyExposureHintFromPath(
    pathname: string
  ): WebsiteScanExposureKind | null {
    const normalized = pathname.toLowerCase();

    if (
      /(?:^|\/)(?:\.env(?:\.[\w-]+)?|config\.json|env\.json|settings\.json|application\.(?:properties|ya?ml))(?:$|\/)/i.test(
        normalized
      )
    ) {
      return "sensitive_file";
    }

    if (
      /(phpmyadmin|adminer(?:\.php)?|pgadmin|mongo-express|redis-commander|_cat\/indices|_cluster\/health|solr\/admin|dbadmin)/i.test(
        normalized
      )
    ) {
      return "database_interface";
    }

    if (
      /(?:^|\/)(?:actuator|metrics|healthz?|server-status|nginx_status|debug|jmx-console|manage)(?:$|\/)/i.test(
        normalized
      )
    ) {
      return "internal_service";
    }

    if (
      /(?:^|\/)(?:openapi(?:\.json)?|swagger(?:\.json)?|v\d+\/api-docs|api-docs|graphi?ql|playground)(?:$|\/)/i.test(
        normalized
      ) ||
      normalized === "/graphql" ||
      normalized.startsWith("/graphql/")
    ) {
      return "api_documentation";
    }

    if (normalized === "/api" || normalized.startsWith("/api/")) {
      return "api_endpoint";
    }

    return null;
  }

  private async inspectExposureCandidate(
    originUrl: URL,
    candidate: ExposureCandidate
  ): Promise<ExposureObservation | null> {
    try {
      const response = await this.fetchFollowingRedirects(candidate.url, true, {
        allowErrorStatus: true
      });

      if (response.finalUrl.origin !== originUrl.origin) {
        response.response.body?.cancel();
        return null;
      }

      const statusCode = response.response.status;
      if ([401, 403, 404, 405].includes(statusCode)) {
        response.response.body?.cancel();
        return null;
      }

      const contentType = this.getContentType(response.response);
      const preview = await this.readResponsePreview(response.response, 24576);
      return this.classifyExposureObservation(candidate, {
        finalUrl: response.finalUrl,
        statusCode,
        contentType,
        preview
      });
    } catch {
      return null;
    }
  }

  private classifyExposureObservation(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    const sensitiveFile =
      candidate.kindHint === "sensitive_file"
        ? this.classifySensitiveFileExposure(candidate, input)
        : null;
    if (sensitiveFile) {
      return sensitiveFile;
    }

    const databaseExposure =
      candidate.kindHint === "database_interface"
        ? this.classifyDatabaseInterfaceExposure(candidate, input)
        : null;
    if (databaseExposure) {
      return databaseExposure;
    }

    const internalServiceExposure =
      candidate.kindHint === "internal_service"
        ? this.classifyInternalServiceExposure(candidate, input)
        : null;
    if (internalServiceExposure) {
      return internalServiceExposure;
    }

    const apiDocumentationExposure =
      candidate.kindHint === "api_documentation"
        ? this.classifyApiDocumentationExposure(candidate, input)
        : null;
    if (apiDocumentationExposure) {
      return apiDocumentationExposure;
    }

    if (
      candidate.kindHint === "api_documentation" ||
      candidate.kindHint === "api_endpoint"
    ) {
      return this.classifyApiEndpointExposure(candidate, input);
    }

    return null;
  }

  private classifySensitiveFileExposure(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    if (input.statusCode !== 200) {
      return null;
    }

    const markers = this.collectExposureMarkers(input.preview.preview);
    const looksLikeEnvFile = /^[A-Z][A-Z0-9_]*\s*=\s*.+/m.test(input.preview.preview);
    const looksLikeHtmlDocument = /<!doctype html|<html\b/i.test(input.preview.preview);
    const path = input.finalUrl.pathname.toLowerCase();
    const confirmExposure =
      path.includes(".env")
        ? looksLikeEnvFile ||
          (!looksLikeHtmlDocument &&
            markers.some((marker) =>
              ["connection_string", "internal_host", "secret_material"].includes(
                marker
              )
            ))
        : markers.some((marker) =>
            ["connection_string", "internal_host", "secret_material"].includes(
              marker
            )
          );

    if (!confirmExposure) {
      return null;
    }

    const evidence = this.buildExposureEvidence({
      statusCode: input.statusCode,
      contentType: input.contentType,
      markers
    });

    return {
      endpoint: {
        url: input.finalUrl.toString(),
        kind: "sensitive_file",
        statusCode: input.statusCode,
        contentType: input.contentType,
        evidence
      },
      finding: {
        id: `exposure-sensitive-file-${input.finalUrl.toString()}`,
        severity: "high",
        category: "exposure",
        title: "Sensitive configuration file is publicly reachable",
        summary:
          "A configuration or environment file was served directly from the public origin, which can leak secrets, connection details, or internal-only settings.",
        remediation:
          "Remove sensitive files from the public web root, serve only sanitized client-safe configuration, and block direct access at the web server or CDN edge.",
        pageUrl: input.finalUrl.toString(),
        evidence
      }
    };
  }

  private classifyDatabaseInterfaceExposure(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    if (input.statusCode !== 200) {
      return null;
    }

    const service = this.detectDatabaseInterfaceName(
      input.finalUrl.pathname,
      input.preview.preview
    );
    if (!service) {
      return null;
    }

    const evidence = this.buildExposureEvidence({
      statusCode: input.statusCode,
      contentType: input.contentType,
      service
    });

    return {
      endpoint: {
        url: input.finalUrl.toString(),
        kind: "database_interface",
        statusCode: input.statusCode,
        contentType: input.contentType,
        evidence
      },
      finding: {
        id: `exposure-database-interface-${input.finalUrl.toString()}`,
        severity: "high",
        category: "exposure",
        title: `${service} appears publicly reachable`,
        summary:
          "A database administration or cluster-management surface responded on the public origin, which can expose internal data layout and sharply reduce attacker effort.",
        remediation:
          "Move database management surfaces behind private network controls, require strong authentication, and remove any public route that reaches them directly.",
        pageUrl: input.finalUrl.toString(),
        evidence
      }
    };
  }

  private classifyInternalServiceExposure(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    if (
      input.statusCode !== 200 &&
      !this.collectExposureMarkers(input.preview.preview).includes("stack_trace")
    ) {
      return null;
    }

    const service = this.detectInternalServiceName(
      input.finalUrl.pathname,
      input.preview.preview
    );
    if (!service) {
      return null;
    }

    const markers = this.collectExposureMarkers(input.preview.preview);
    const highSeverity =
      /\/(?:env|debug|jmx-console)(?:\/|$)/i.test(input.finalUrl.pathname) ||
      markers.some((marker) =>
        ["connection_string", "internal_host", "secret_material", "stack_trace"].includes(
          marker
        )
      );
    const evidence = this.buildExposureEvidence({
      statusCode: input.statusCode,
      contentType: input.contentType,
      service,
      markers
    });

    return {
      endpoint: {
        url: input.finalUrl.toString(),
        kind: "internal_service",
        statusCode: input.statusCode,
        contentType: input.contentType,
        evidence
      },
      finding: {
        id: `exposure-internal-service-${input.finalUrl.toString()}`,
        severity: highSeverity ? "high" : "medium",
        category: "exposure",
        title: "Internal management or diagnostics endpoint is publicly reachable",
        summary:
          "A health, metrics, debug, or management route responded from the public edge and disclosed operational detail that should usually stay private.",
        remediation:
          "Restrict operational and management endpoints to authenticated administrators or private networks, and remove public debug or diagnostics routes that are not required.",
        pageUrl: input.finalUrl.toString(),
        evidence
      }
    };
  }

  private classifyApiDocumentationExposure(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    if (input.statusCode !== 200) {
      return null;
    }

    const preview = input.preview.preview.toLowerCase();
    const hasOpenApiMarkers =
      /(openapi|swagger-ui|swagger ui|redoc|\"paths\"\s*:|\"components\"\s*:|graphql playground|graphiql|apollo sandbox)/i.test(
        preview
      );
    if (!hasOpenApiMarkers) {
      return null;
    }

    const interactiveGraphQl =
      /(graphql playground|graphiql|apollo sandbox)/i.test(preview) ||
      /\/graphql(?:\/|$)/i.test(input.finalUrl.pathname);
    const evidence = this.buildExposureEvidence({
      statusCode: input.statusCode,
      contentType: input.contentType,
      markers: interactiveGraphQl ? ["interactive_graphql"] : ["api_schema"]
    });

    return {
      endpoint: {
        url: input.finalUrl.toString(),
        kind: "api_documentation",
        statusCode: input.statusCode,
        contentType: input.contentType,
        evidence
      },
      finding: {
        id: `exposure-api-docs-${input.finalUrl.toString()}`,
        severity: interactiveGraphQl ? "medium" : "low",
        category: "exposure",
        title: interactiveGraphQl
          ? "Interactive API explorer is publicly reachable"
          : "Public API documentation is reachable",
        summary:
          "Machine-readable API descriptions or interactive explorer tooling were exposed on the public origin, which can accelerate route discovery and later misuse.",
        remediation:
          "Restrict API documentation and explorer tooling to authenticated administrators or publish a sanitized public variant that omits internal or privileged routes.",
        pageUrl: input.finalUrl.toString(),
        evidence
      }
    };
  }

  private classifyApiEndpointExposure(
    candidate: ExposureCandidate,
    input: {
      finalUrl: URL;
      statusCode: number;
      contentType: string;
      preview: ResponsePreview;
    }
  ): ExposureObservation | null {
    const preview = input.preview.preview;
    const markers = this.collectExposureMarkers(preview);
    const keys = this.collectJsonKeys(preview);
    const path = input.finalUrl.pathname.toLowerCase();
    const looksLikeJson =
      input.contentType.includes("json") || /^[\s[{]/.test(preview.trim());
    const isHtmlDocument = /<!doctype html|<html\b/i.test(preview);
    const looksSensitivePath =
      /\/api\/(?:me|user|users|account|profile|admin|internal|config|settings)(?:\/|$)/i.test(
        path
      ) || path === "/graphql";

    if (
      !looksLikeJson ||
      isHtmlDocument ||
      (!looksSensitivePath &&
        !markers.some((marker) =>
          ["identity_fields", "secret_material", "connection_string", "stack_trace"].includes(
            marker
          )
        ))
    ) {
      return null;
    }

    const severity =
      markers.some((marker) =>
        ["secret_material", "connection_string", "stack_trace"].includes(marker)
      ) ||
      /\/api\/(?:admin|internal|config)(?:\/|$)/i.test(path)
        ? "high"
        : "medium";
    const evidence = this.buildExposureEvidence({
      statusCode: input.statusCode,
      contentType: input.contentType,
      markers,
      keys
    });

    return {
      endpoint: {
        url: input.finalUrl.toString(),
        kind: "api_endpoint",
        statusCode: input.statusCode,
        contentType: input.contentType,
        evidence
      },
      finding: {
        id: `exposure-api-data-${input.finalUrl.toString()}`,
        severity,
        category: "exposure",
        title: "Likely sensitive API route returned data publicly",
        summary:
          "An API path associated with account, administrative, internal, or configuration data returned structured content without an authentication challenge.",
        remediation:
          "Require authentication and authorization on sensitive API routes, return only the minimum necessary fields, and remove public debug or internal API variants from the internet edge.",
        pageUrl: input.finalUrl.toString(),
        evidence
      }
    };
  }

  private buildExposureEvidence(input: {
    statusCode: number;
    contentType: string;
    service?: string;
    markers?: string[];
    keys?: string[];
  }): string[] {
    const evidence = [`status=${input.statusCode}`];

    if (input.contentType) {
      evidence.push(`content-type=${input.contentType}`);
    }

    if (input.service) {
      evidence.push(`service=${input.service}`);
    }

    if (input.keys && input.keys.length > 0) {
      evidence.push(`keys=${input.keys.slice(0, 6).join(",")}`);
    }

    if (input.markers && input.markers.length > 0) {
      evidence.push(`markers=${input.markers.slice(0, 6).join(",")}`);
    }

    return evidence;
  }

  private collectExposureMarkers(preview: string): string[] {
    const markers = new Set<string>();
    const normalized = preview.toLowerCase();
    const keys = this.collectJsonKeys(preview);

    if (
      /(password|passwd|pwd|secret|token|api[_-]?key|client[_-]?secret|authorization|session[_-]?id)/i.test(
        preview
      ) ||
      keys.some((key) =>
        /(password|secret|token|api[_-]?key|authorization|session)/i.test(key)
      )
    ) {
      markers.add("secret_material");
    }

    if (
      /(postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/|redis:\/\/|jdbc:|amqp:\/\/)/i.test(
        normalized
      )
    ) {
      markers.add("connection_string");
    }

    if (
      /\b(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|\.internal\b|\.local\b)\b/i.test(
        preview
      )
    ) {
      markers.add("internal_host");
    }

    if (
      /(email|username|first_name|last_name|phone|address|ssn|dob|role|roles|user|users|admin)/i.test(
        preview
      ) ||
      keys.some((key) =>
        /(email|username|phone|address|ssn|dob|role|user|users|admin)/i.test(key)
      )
    ) {
      markers.add("identity_fields");
    }

    if (
      /(stack trace|exception|traceback|org\.springframework|at [\w.$]+\([^)]*\)|sqlstate|syntax error|java\.lang\.)/i.test(
        preview
      )
    ) {
      markers.add("stack_trace");
    }

    return [...markers];
  }

  private collectJsonKeys(preview: string): string[] {
    const keys = new Set<string>();

    const collect = (value: unknown, depth: number) => {
      if (depth > 2 || keys.size >= 10) {
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value.slice(0, 2)) {
          collect(item, depth + 1);
        }
        return;
      }

      if (!value || typeof value !== "object") {
        return;
      }

      for (const [key, nested] of Object.entries(value).slice(0, 10)) {
        keys.add(key.toLowerCase());
        collect(nested, depth + 1);
      }
    };

    try {
      collect(JSON.parse(preview), 0);
      return [...keys];
    } catch {
      for (const match of preview.matchAll(/"([A-Za-z0-9_.-]{2,40})"\s*:/g)) {
        keys.add(match[1]!.toLowerCase());
        if (keys.size >= 10) {
          break;
        }
      }

      return [...keys];
    }
  }

  private detectDatabaseInterfaceName(pathname: string, preview: string): string | null {
    const combined = `${pathname}\n${preview}`.toLowerCase();

    if (combined.includes("phpmyadmin")) {
      return "phpMyAdmin";
    }
    if (combined.includes("adminer")) {
      return "Adminer";
    }
    if (combined.includes("pgadmin")) {
      return "pgAdmin";
    }
    if (combined.includes("mongo-express")) {
      return "Mongo Express";
    }
    if (combined.includes("redis-commander")) {
      return "Redis Commander";
    }
    if (
      combined.includes("/_cat/indices") ||
      combined.includes("cluster_name") ||
      combined.includes("number_of_nodes")
    ) {
      return "Elasticsearch";
    }
    if (combined.includes("solr")) {
      return "Apache Solr";
    }

    return null;
  }

  private detectInternalServiceName(pathname: string, preview: string): string | null {
    const combined = `${pathname}\n${preview}`.toLowerCase();

    if (
      combined.includes("actuator") ||
      /"status"\s*:\s*"up"/i.test(preview) ||
      /"beans"\s*:|"metrics"\s*:|"propertysources"\s*:/i.test(preview)
    ) {
      return "Spring Boot Actuator";
    }
    if (combined.includes("# help") || combined.includes("process_cpu_seconds_total")) {
      return "Prometheus metrics";
    }
    if (combined.includes("server-status") || combined.includes("apache server status")) {
      return "Apache server-status";
    }
    if (combined.includes("nginx_status") || combined.includes("active connections")) {
      return "Nginx stub status";
    }
    if (
      combined.includes("/debug/vars") ||
      combined.includes("memstats") ||
      combined.includes("goroutines")
    ) {
      return "Go debug endpoint";
    }
    if (combined.includes("jmx-console")) {
      return "JMX console";
    }
    if (
      combined.includes("/health") ||
      combined.includes("/metrics") ||
      combined.includes("/status")
    ) {
      return "health or diagnostics endpoint";
    }

    return null;
  }

  private async readResponsePreview(
    response: Response,
    maxBytes: number
  ): Promise<ResponsePreview> {
    const contentType = this.getContentType(response);
    const rawContentLength = response.headers.get("content-length");
    const contentLength =
      rawContentLength && /^\d+$/.test(rawContentLength)
        ? Number(rawContentLength)
        : null;

    if (!response.body) {
      return {
        preview: "",
        contentLength,
        truncated: false
      };
    }

    if (
      !this.isPreviewTextLike(contentType) ||
      (contentLength !== null && contentLength > maxBytes * 4)
    ) {
      await response.body.cancel().catch(() => undefined);
      return {
        preview: "",
        contentLength,
        truncated: contentLength !== null && contentLength > 0
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let preview = "";
    let bytesRead = 0;
    let truncated = false;

    try {
      while (bytesRead < maxBytes) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        const value = chunk.value;
        if (!value) {
          continue;
        }

        const remaining = maxBytes - bytesRead;
        const slice =
          value.byteLength > remaining ? value.subarray(0, remaining) : value;
        preview += decoder.decode(slice, {
          stream: slice.byteLength === value.byteLength
        });
        bytesRead += slice.byteLength;

        if (slice.byteLength < value.byteLength) {
          truncated = true;
          break;
        }
      }

      preview += decoder.decode();
      return {
        preview,
        contentLength,
        truncated: truncated || (contentLength !== null && contentLength > bytesRead)
      };
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private analyzePage(input: {
    url: URL;
    html: string;
    statusCode: number;
    contentType: string;
  }): PageAnalysis {
    const forms = this.extractForms(input.html, input.url);
    const title = this.extractTitle(input.html);
    const links = this.extractLinks(input.html, input.url);
    const scriptInsights = this.extractScriptInsights(input.html, input.url);
    const sameOriginLinkCount = links.filter((link) => link.origin === input.url.origin).length;
    const externalLinkCount = links.length - sameOriginLinkCount;

    return {
      url: input.url.toString(),
      title,
      statusCode: input.statusCode,
      contentType: input.contentType,
      linkCount: links.length,
      sameOriginLinkCount,
      externalLinkCount,
      formCount: forms.length,
      loginFormCount: forms.filter((form) => form.hasPasswordField).length,
      externalFormActionCount: forms.filter((form) => form.externalAction).length,
      insecurePasswordSubmitCount: forms.filter((form) => form.insecurePasswordSubmit).length,
      inlineScriptCount: scriptInsights.inlineScriptCount,
      externalScriptCount: scriptInsights.externalScriptCount,
      thirdPartyScriptCount: scriptInsights.thirdPartyScriptCount,
      mixedContentCount:
        input.url.protocol === "https:"
          ? this.countMixedContentReferences(input.html)
          : 0,
      directoryListingDetected: this.detectDirectoryListing(title, input.html),
      links,
      generator: this.extractMetaGenerator(input.html)
    };
  }

  private buildFindings(input: {
    rootPage: PageAnalysis;
    pages: PageAnalysis[];
    headers: WebsiteScanResult["headers"];
    cookies: CookieAssessment;
    transport: WebsiteScanResult["transport"];
    rootAccessChallengeDetected: boolean;
    tlsCertificateValidationError?: string | null;
    exposureFindings: WebsiteScanFinding[];
  }): WebsiteScanFinding[] {
    const findings: WebsiteScanFinding[] = [];
    const findingIds = new Set<string>();

    const pushFinding = (finding: WebsiteScanFinding) => {
      if (findingIds.has(finding.id)) {
        return;
      }

      findingIds.add(finding.id);
      findings.push(finding);
    };

    if (
      input.transport.finalProtocol === "https" &&
      input.tlsCertificateValidationError
    ) {
      pushFinding({
        id: "transport-invalid-tls-certificate",
        severity: "high",
        category: "transport",
        title: "TLS certificate validation failed",
        summary:
          "The site answered over HTTPS, but the certificate chain could not be validated, so browsers will warn users or block the connection until trust is fixed.",
        remediation:
          "Install a complete and trusted TLS certificate chain for the public hostname, including any required intermediate certificates, and confirm the certificate matches the deployed domain.",
        pageUrl: input.rootPage.url,
        evidence: [input.tlsCertificateValidationError]
      });
    }

    if (input.rootAccessChallengeDetected) {
      pushFinding({
        id: "content-access-challenge",
        severity: "info",
        category: "content",
        title: "Site presented an anti-bot or access challenge",
        summary:
          "The target returned an interstitial or challenge page instead of the normal application response, so deep page analysis was intentionally limited.",
        remediation:
          "Repeat the scan from an allowed network path or validate the public edge configuration manually if deeper application inspection is required.",
        pageUrl: input.rootPage.url,
        evidence: [`HTTP ${input.rootPage.statusCode}`, input.rootPage.title]
      });

      if (input.rootPage.statusCode >= 400) {
        pushFinding({
          id: `content-root-http-${input.rootPage.statusCode}`,
          severity: input.rootPage.statusCode >= 500 ? "medium" : "low",
          category: "content",
          title: `Root page returned HTTP ${input.rootPage.statusCode}`,
          summary:
            "The scanner reached an error page instead of a normal application response, so the report only reflects the accessible edge response.",
          remediation:
            "Verify that the public entry URL responds successfully to normal browsers and review any upstream access controls or temporary outage conditions.",
          pageUrl: input.rootPage.url,
          evidence: [input.rootPage.title || "Untitled page"]
        });
      }

      return this.sortFindings(findings);
    }

    if (input.transport.finalProtocol !== "https") {
      pushFinding({
        id: "transport-no-https",
        severity: "high",
        category: "transport",
        title: "HTTPS is not enforced",
        summary:
          "The scanned site finished over plain HTTP, so traffic can be intercepted or modified in transit.",
        remediation:
          "Serve the application over HTTPS and redirect all HTTP requests to the HTTPS origin.",
        evidence: [input.rootPage.url]
      });
    } else if (!input.transport.redirectedToHttps) {
      pushFinding({
        id: "transport-http-not-redirected",
        severity: "high",
        category: "transport",
        title: "HTTP does not redirect cleanly to HTTPS",
        summary:
          "The HTTP endpoint did not consistently redirect clients to the HTTPS version of the site.",
        remediation:
          "Configure a permanent redirect from HTTP to HTTPS on the web server or reverse proxy.",
        evidence: [input.rootPage.url]
      });
    }

    if (input.transport.finalProtocol === "https" && !input.transport.hstsEnabled) {
      pushFinding({
        id: "transport-missing-hsts",
        severity: "medium",
        category: "transport",
        title: "Strict-Transport-Security is missing",
        summary:
          "Browsers are not instructed to pin the site to HTTPS, which weakens downgrade protection.",
        remediation:
          "Add a Strict-Transport-Security header with an appropriate max-age and includeSubDomains where valid.",
        evidence: [input.rootPage.url]
      });
    }

    if (input.rootPage.statusCode >= 400) {
      pushFinding({
        id: `content-root-http-${input.rootPage.statusCode}`,
        severity: input.rootPage.statusCode >= 500 ? "medium" : "low",
        category: "content",
        title: `Root page returned HTTP ${input.rootPage.statusCode}`,
        summary:
          "The scanner reached an error page instead of a normal application response, so the report only reflects the accessible edge response.",
        remediation:
          "Verify that the public entry URL responds successfully to normal browsers and review any upstream access controls or temporary outage conditions.",
        pageUrl: input.rootPage.url,
        evidence: [input.rootPage.title || "Untitled page"]
      });
    }

    if (input.rootAccessChallengeDetected || input.rootPage.statusCode >= 400) {
      return this.sortFindings(findings);
    }

    if (!input.headers.contentSecurityPolicy) {
      pushFinding({
        id: "headers-missing-csp",
        severity: "medium",
        category: "headers",
        title: "Content-Security-Policy is missing",
        summary:
          "The site does not define a CSP, which reduces protection against injected script and mixed content issues.",
        remediation:
          "Deploy a restrictive Content-Security-Policy and tighten it iteratively using report-only mode first if needed.",
        evidence: [input.rootPage.url]
      });
    } else if (this.isWeakContentSecurityPolicy(input.headers.contentSecurityPolicy)) {
      pushFinding({
        id: "headers-weak-csp",
        severity: "medium",
        category: "headers",
        title: "Content-Security-Policy is weak",
        summary:
          "The current CSP allows unsafe or overly broad sources that weaken browser-side hardening.",
        remediation:
          "Remove wildcard and unsafe-inline or unsafe-eval directives where possible and scope sources to explicit origins.",
        evidence: [this.redactVersionTokens(input.headers.contentSecurityPolicy)]
      });
    }

    if (
      !input.headers.xFrameOptions &&
      !(input.headers.contentSecurityPolicy ?? "").toLowerCase().includes("frame-ancestors")
    ) {
      pushFinding({
        id: "headers-missing-frame-protection",
        severity: "medium",
        category: "headers",
        title: "Clickjacking protection is missing",
        summary:
          "Neither X-Frame-Options nor CSP frame-ancestors was present on the root response.",
        remediation:
          "Add X-Frame-Options or define frame-ancestors in CSP to restrict embedding.",
        evidence: [input.rootPage.url]
      });
    }

    if ((input.headers.xContentTypeOptions ?? "").toLowerCase() !== "nosniff") {
      pushFinding({
        id: "headers-missing-nosniff",
        severity: "low",
        category: "headers",
        title: "X-Content-Type-Options is missing",
        summary:
          "Browsers are not explicitly instructed to disable MIME sniffing on the root response.",
        remediation:
          "Set X-Content-Type-Options to nosniff on HTML and asset responses.",
        evidence: [input.rootPage.url]
      });
    }

    if (!input.headers.referrerPolicy) {
      pushFinding({
        id: "headers-missing-referrer-policy",
        severity: "low",
        category: "headers",
        title: "Referrer-Policy is missing",
        summary:
          "The site does not define how referrer data should be shared across navigations and requests.",
        remediation:
          "Set a Referrer-Policy such as strict-origin-when-cross-origin or stricter where appropriate.",
        evidence: [input.rootPage.url]
      });
    }

    if (!input.headers.permissionsPolicy) {
      pushFinding({
        id: "headers-missing-permissions-policy",
        severity: "low",
        category: "headers",
        title: "Permissions-Policy is missing",
        summary:
          "Browser access to powerful features is not explicitly constrained on the root response.",
        remediation:
          "Define a Permissions-Policy aligned to the features the site actually uses.",
        evidence: [input.rootPage.url]
      });
    }

    if (!input.headers.crossOriginOpenerPolicy) {
      pushFinding({
        id: "headers-missing-coop",
        severity: "info",
        category: "headers",
        title: "Cross-Origin-Opener-Policy is missing",
        summary:
          "The root response does not isolate browsing context relationships with COOP.",
        remediation:
          "Add Cross-Origin-Opener-Policy where cross-window isolation is desired.",
        evidence: [input.rootPage.url]
      });
    }

    const allowOrigin = input.headers.accessControlAllowOrigin?.trim();
    const allowCredentials = input.headers.accessControlAllowCredentials?.trim().toLowerCase();
    if (allowOrigin === "*" && allowCredentials === "true") {
      pushFinding({
        id: "cors-wildcard-credentials",
        severity: "high",
        category: "cors",
        title: "CORS allows credentials with a wildcard origin",
        summary:
          "The root response exposes an invalid and highly permissive CORS combination.",
        remediation:
          "Reflect only trusted origins and avoid allowing credentials unless strictly required.",
        evidence: ["Access-Control-Allow-Origin: *", "Access-Control-Allow-Credentials: true"]
      });
    } else if (allowOrigin === "*") {
      pushFinding({
        id: "cors-wildcard-origin",
        severity: "medium",
        category: "cors",
        title: "CORS allows any origin",
        summary:
          "The root response advertises a wildcard CORS policy, which can broaden exposure of cross-origin resources.",
        remediation:
          "Limit Access-Control-Allow-Origin to the specific origins that require access.",
        evidence: ["Access-Control-Allow-Origin: *"]
      });
    }

    if (input.cookies.total > 0 && input.cookies.missingSecure > 0) {
      pushFinding({
        id: "cookies-missing-secure",
        severity: "high",
        category: "cookies",
        title: "HTTPS cookies are missing the Secure flag",
        summary:
          "One or more cookies set over HTTPS did not include the Secure attribute.",
        remediation:
          "Mark session and sensitive cookies as Secure so they are not sent over plain HTTP.",
        evidence: [`${input.cookies.missingSecure} cookie(s) missing Secure`]
      });
    }

    if (input.cookies.total > 0 && input.cookies.missingHttpOnly > 0) {
      pushFinding({
        id: "cookies-missing-httponly",
        severity: "medium",
        category: "cookies",
        title: "Cookies are missing the HttpOnly flag",
        summary:
          "One or more cookies can be read by client-side script because HttpOnly is not set.",
        remediation:
          "Apply HttpOnly to session and sensitive cookies that do not need JavaScript access.",
        evidence: [`${input.cookies.missingHttpOnly} cookie(s) missing HttpOnly`]
      });
    }

    if (input.cookies.total > 0 && input.cookies.missingSameSite > 0) {
      pushFinding({
        id: "cookies-missing-samesite",
        severity: "low",
        category: "cookies",
        title: "Cookies are missing SameSite",
        summary:
          "Some cookies do not define SameSite behavior, which weakens CSRF-related browser protections.",
        remediation:
          "Set SameSite=Lax or SameSite=Strict unless a cross-site use case requires None with Secure.",
        evidence: [`${input.cookies.missingSameSite} cookie(s) missing SameSite`]
      });
    }

    if (input.headers.xPoweredBy) {
      pushFinding({
        id: "headers-x-powered-by",
        severity: "low",
        category: "headers",
        title: "X-Powered-By is exposed",
        summary:
          "The root response leaks framework or runtime details through the X-Powered-By header.",
        remediation:
          "Remove X-Powered-By in the application server or reverse proxy.",
        evidence: [this.redactVersionTokens(input.headers.xPoweredBy)]
      });
    }

    if (input.headers.server && this.looksVersioned(input.headers.server)) {
      pushFinding({
        id: "headers-server-version",
        severity: "low",
        category: "headers",
        title: "Server header exposes version details",
        summary:
          "The Server header appears to disclose stack information that can help targeted fingerprinting.",
        remediation:
          "Reduce or standardize the Server header value at the edge where practical.",
        evidence: [this.redactVersionTokens(input.headers.server)]
      });
    }

    if (input.rootPage.generator && this.looksVersioned(input.rootPage.generator)) {
      pushFinding({
        id: "content-generator-version",
        severity: "low",
        category: "content",
        title: "Generator metadata exposes version details",
        summary:
          "The page metadata discloses implementation version information in a generator tag.",
        remediation:
          "Remove or sanitize public generator metadata if it is not required.",
        evidence: [this.redactVersionTokens(input.rootPage.generator)]
      });
    }

    for (const page of input.pages) {
      if (page.mixedContentCount > 0) {
        pushFinding({
          id: `content-mixed-${page.url}`,
          severity: "high",
          category: "content",
          title: "Mixed content references detected",
          summary:
            "The page includes HTTP subresources or links from an HTTPS page, which can break browser security guarantees.",
          remediation:
            "Update embedded assets and form actions to HTTPS or protocol-relative safe origins.",
          pageUrl: page.url,
          evidence: [`${page.mixedContentCount} mixed content reference(s)`]
        });
      }

      if (page.insecurePasswordSubmitCount > 0) {
        pushFinding({
          id: `forms-insecure-password-${page.url}`,
          severity: "high",
          category: "forms",
          title: "Password form submits insecurely",
          summary:
            "A password-bearing form posts to an HTTP action or is served from an HTTP page.",
          remediation:
            "Serve authentication pages over HTTPS and post credential forms only to HTTPS endpoints.",
          pageUrl: page.url,
          evidence: [`${page.insecurePasswordSubmitCount} insecure password form(s)`]
        });
      }

      if (page.externalFormActionCount > 0) {
        pushFinding({
          id: `forms-external-action-${page.url}`,
          severity: "medium",
          category: "forms",
          title: "Form submits to an external origin",
          summary:
            "One or more forms submit data to a different origin than the page being scanned.",
          remediation:
            "Review whether cross-origin form submission is necessary and document the trust boundary explicitly.",
          pageUrl: page.url,
          evidence: [`${page.externalFormActionCount} external form action(s)`]
        });
      }

      if (page.thirdPartyScriptCount > 0) {
        pushFinding({
          id: `content-third-party-scripts-${page.url}`,
          severity: "low",
          category: "content",
          title: "Third-party scripts are loaded on the page",
          summary:
            "The page loads one or more scripts from a different origin, which expands the trust boundary for client-side code execution.",
          remediation:
            "Review each third-party script dependency, pin it to trusted sources, and use integrity controls or a tighter CSP where possible.",
          pageUrl: page.url,
          evidence: [`${page.thirdPartyScriptCount} third-party script(s)`]
        });
      }

      if (page.directoryListingDetected) {
        pushFinding({
          id: `content-directory-listing-${page.url}`,
          severity: "medium",
          category: "content",
          title: "Directory listing appears enabled",
          summary:
            "The page content resembles an index listing, which can expose unintended file structure and artifacts.",
          remediation:
            "Disable directory listing on the web server and ensure only intended assets are publicly reachable.",
          pageUrl: page.url,
          evidence: [page.url]
        });
      }
    }

    for (const finding of input.exposureFindings) {
      pushFinding(finding);
    }

    return this.sortFindings(findings);
  }

  private assessRootResponse(input: {
    responseStatus: number;
    page: PageAnalysis;
    html: string;
  }): RootResponseAssessment {
    const warnings: string[] = [];
    const accessChallengeDetected = this.detectAccessChallengePage(
      input.page.title,
      input.html
    );
    const suppressDeepCrawl = accessChallengeDetected || input.responseStatus >= 400;

    if (accessChallengeDetected) {
      this.pushWarning(
        warnings,
        `Deep crawl was limited because ${input.page.url} presented an anti-bot or access challenge.`
      );
    } else if (input.responseStatus >= 400) {
      this.pushWarning(
        warnings,
        `Deep crawl was limited because ${input.page.url} returned HTTP ${input.responseStatus} at the public entry point.`
      );
    }

    if (
      suppressDeepCrawl &&
      input.page.title &&
      input.page.title !== "Untitled page"
    ) {
      this.pushWarning(warnings, `Accessible edge response title: ${input.page.title}`);
    }

    return {
      warnings,
      suppressDeepCrawl,
      accessChallengeDetected
    };
  }

  private createRootOnlyCrawlOutcome(
    rootPage: PageAnalysis,
    warnings: string[]
  ): CrawlOutcome {
    const discoveredSameOriginPages = new Set<string>();
    const discoveredExternalLinks = new Set<string>();

    for (const link of rootPage.links) {
      const canonical = this.canonicalizeUrl(link);
      if (link.origin === new URL(rootPage.url).origin) {
        discoveredSameOriginPages.add(canonical);
      } else {
        discoveredExternalLinks.add(canonical);
      }
    }

    return {
      pages: [rootPage],
      warnings: [...warnings],
      stats: {
        attemptedPages: 1,
        scannedPages: 1,
        failedPages: 0,
        skippedCrossOriginPages: 0,
        skippedNonHtmlPages: 0,
        duplicatePagesSkipped: 0,
        discoveredSameOriginPages: discoveredSameOriginPages.size,
        discoveredExternalLinks: discoveredExternalLinks.size
      }
    };
  }

  private detectAccessChallengePage(title: string, html: string): boolean {
    const text = `${title}\n${html.slice(0, 6000)}`.toLowerCase();
    const challengePatterns = [
      /just a moment/,
      /attention required/,
      /verify you are human/,
      /human verification/,
      /checking your browser/,
      /checking if the site connection is secure/,
      /enable javascript and cookies to continue/,
      /why do i have to complete a captcha/,
      /cf-browser-verification/,
      /challenge-platform/,
      /security check/,
      /captcha/
    ];

    return challengePatterns.some((pattern) => pattern.test(text));
  }

  private sortFindings(findings: WebsiteScanFinding[]): WebsiteScanFinding[] {
    const severityOrder: Record<WebsiteFindingSeverity, number> = {
      high: 0,
      medium: 1,
      low: 2,
      info: 3
    };

    return findings.sort((left, right) => {
      const bySeverity = severityOrder[left.severity] - severityOrder[right.severity];
      if (bySeverity !== 0) {
        return bySeverity;
      }

      const byCategory = left.category.localeCompare(right.category);
      if (byCategory !== 0) {
        return byCategory;
      }

      return left.title.localeCompare(right.title);
    });
  }

  private extractRelevantHeaders(
    headers: Headers
  ): WebsiteScanResult["headers"] {
    return {
      contentSecurityPolicy: headers.get("content-security-policy"),
      xFrameOptions: headers.get("x-frame-options"),
      xContentTypeOptions: headers.get("x-content-type-options"),
      referrerPolicy: headers.get("referrer-policy"),
      permissionsPolicy: headers.get("permissions-policy"),
      crossOriginOpenerPolicy: headers.get("cross-origin-opener-policy"),
      accessControlAllowOrigin: headers.get("access-control-allow-origin"),
      accessControlAllowCredentials: headers.get("access-control-allow-credentials"),
      server: headers.get("server"),
      xPoweredBy: headers.get("x-powered-by")
    };
  }

  private async checkCommonResources(baseUrl: URL): Promise<WebsiteScanResourceCheck[]> {
    const targets: Array<{
      name: WebsiteScanResourceCheck["name"];
      path: string;
    }> = [
      {
        name: "robots.txt",
        path: "/robots.txt"
      },
      {
        name: "security.txt",
        path: "/.well-known/security.txt"
      },
      {
        name: "sitemap.xml",
        path: "/sitemap.xml"
      }
    ];

    return Promise.all(
      targets.map((target) => this.probeCommonResource(baseUrl, target.name, target.path))
    );
  }

  private async probeCommonResource(
    baseUrl: URL,
    name: WebsiteScanResourceCheck["name"],
    path: string
  ): Promise<WebsiteScanResourceCheck> {
    const target = new URL(path, baseUrl);

    try {
      const response = await this.fetchFollowingRedirects(target, false, {
        allowErrorStatus: true
      });
      response.response.body?.cancel();

      return {
        name,
        path,
        status:
          response.response.status >= 200 && response.response.status < 400
            ? "present"
            : response.response.status === 404
              ? "missing"
              : "error",
        statusCode: response.response.status,
        finalUrl: response.finalUrl.toString()
      };
    } catch {
      return {
        name,
        path,
        status: "error",
        statusCode: null
      };
    }
  }

  private collectFingerprints(
    headers: WebsiteScanResult["headers"],
    rootPage: PageAnalysis
  ): WebsiteScanFingerprint[] {
    const fingerprints: WebsiteScanFingerprint[] = [];
    const entries: Array<{
      source: WebsiteScanFingerprint["source"];
      value: string | null;
    }> = [
      {
        source: "server",
        value: headers.server
      },
      {
        source: "x-powered-by",
        value: headers.xPoweredBy
      },
      {
        source: "generator",
        value: rootPage.generator
      }
    ];

    for (const entry of entries) {
      if (!entry.value) {
        continue;
      }

      fingerprints.push({
        source: entry.source,
        value: entry.value,
        sanitizedValue: this.redactVersionTokens(entry.value)
      });
    }

    return fingerprints;
  }

  private assessCookies(headers: Headers, isHttps: boolean): CookieAssessment {
    const rawCookies = this.readSetCookies(headers);
    return this.assessCookieValues(rawCookies, isHttps);
  }

  private assessObservedCookies(
    cookies: BrowserObservedCookie[],
    isHttps: boolean
  ): CookieAssessment {
    return cookies.reduce<CookieAssessment>(
      (assessment, cookie) => {
        assessment.total += 1;
        if (isHttps && !cookie.secure) {
          assessment.missingSecure += 1;
        }
        if (!cookie.httpOnly) {
          assessment.missingHttpOnly += 1;
        }
        if (cookie.sameSite === "Unset") {
          assessment.missingSameSite += 1;
        }
        return assessment;
      },
      {
        total: 0,
        missingSecure: 0,
        missingHttpOnly: 0,
        missingSameSite: 0
      }
    );
  }

  private assessCookieValues(rawCookies: string[], isHttps: boolean): CookieAssessment {
    const assessment: CookieAssessment = {
      total: rawCookies.length,
      missingSecure: 0,
      missingHttpOnly: 0,
      missingSameSite: 0
    };

    for (const cookie of rawCookies) {
      const normalized = cookie.toLowerCase();
      if (isHttps && !normalized.includes("; secure")) {
        assessment.missingSecure += 1;
      }
      if (!normalized.includes("; httponly")) {
        assessment.missingHttpOnly += 1;
      }
      if (!normalized.includes("; samesite=")) {
        assessment.missingSameSite += 1;
      }
    }

    return assessment;
  }

  private summarizeSurface(pages: PageAnalysis[]): WebsiteScanSurfaceMetrics {
    return pages.reduce<WebsiteScanSurfaceMetrics>(
      (surface, page) => {
        surface.totalForms += page.formCount;
        surface.loginForms += page.loginFormCount;
        surface.externalFormActions += page.externalFormActionCount;
        surface.insecurePasswordSubmissions += page.insecurePasswordSubmitCount;
        surface.inlineScripts += page.inlineScriptCount;
        surface.externalScripts += page.externalScriptCount;
        surface.thirdPartyScripts += page.thirdPartyScriptCount;
        surface.mixedContentReferences += page.mixedContentCount;
        surface.directoryListings += page.directoryListingDetected ? 1 : 0;
        return surface;
      },
      {
        totalForms: 0,
        loginForms: 0,
        externalFormActions: 0,
        insecurePasswordSubmissions: 0,
        inlineScripts: 0,
        externalScripts: 0,
        thirdPartyScripts: 0,
        mixedContentReferences: 0,
        directoryListings: 0
      }
    );
  }

  private buildSummary(input: {
    findings: WebsiteScanFinding[];
    findingCounts: Record<WebsiteFindingSeverity, number>;
    securityScore: number;
    transport: WebsiteScanResult["transport"];
    headers: WebsiteScanResult["headers"];
    cookies: CookieAssessment;
    pages: PageAnalysis[];
    analysis: WebsiteScanResult["analysis"];
    exposures: WebsiteScanExposureSummary;
  }): WebsiteScanSummary {
    const strengths: string[] = [];
    const limitedByAccessChallenge = input.findings.some(
      (finding) => finding.id === "content-access-challenge"
    );
    const limitedByRootHttp = input.findings.some((finding) =>
      finding.id.startsWith("content-root-http-")
    );
    const limitedAssessment = limitedByAccessChallenge || limitedByRootHttp;

    if (input.transport.finalProtocol === "https" && input.transport.certificateTrusted) {
      strengths.push("The scanned entry point is served over HTTPS.");
    }
    if (input.transport.redirectedToHttps) {
      strengths.push("The HTTP variant redirects users to HTTPS.");
    }
    if (input.analysis.mode === "browser") {
      strengths.push(
        `A rendered browser crawl completed across ${input.pages.length} page(s).`
      );
    }
    if (!limitedAssessment && input.transport.hstsEnabled) {
      strengths.push("Strict-Transport-Security is enabled on the root response.");
    }
    if (
      !limitedAssessment &&
      input.headers.contentSecurityPolicy &&
      !this.isWeakContentSecurityPolicy(input.headers.contentSecurityPolicy)
    ) {
      strengths.push("A non-trivial Content-Security-Policy is present.");
    }
    if (
      !limitedAssessment &&
      (input.headers.xFrameOptions ||
        (input.headers.contentSecurityPolicy ?? "")
          .toLowerCase()
          .includes("frame-ancestors"))
    ) {
      strengths.push("The site advertises clickjacking protection.");
    }
    if (
      !limitedAssessment &&
      (input.headers.xContentTypeOptions ?? "").toLowerCase() === "nosniff"
    ) {
      strengths.push("The root response disables MIME sniffing.");
    }
    if (!limitedAssessment && input.cookies.total > 0 && input.cookies.missingSecure === 0) {
      strengths.push("Observed HTTPS cookies use the Secure attribute.");
    }
    if (
      !limitedAssessment &&
      input.pages.every(
        (page) => page.mixedContentCount === 0 && page.insecurePasswordSubmitCount === 0
      )
    ) {
      strengths.push("No insecure password forms or mixed-content references were seen in the crawl window.");
    }

    const exposureCount =
      input.exposures.publicApiDocs +
      input.exposures.publicApiEndpoints +
      input.exposures.publicDatabaseInterfaces +
      input.exposures.publicInternalServices +
      input.exposures.sensitiveFiles;
    if (!limitedAssessment && input.exposures.probedEndpoints > 0 && exposureCount === 0) {
      strengths.push(
        "No public API docs, sensitive API responses, database admin panels, or internal service endpoints were confirmed in the passive probe window."
      );
    }

    const topRisks = input.findings.slice(0, 3).map((finding) => finding.title);
    const recommendedActions = Array.from(
      new Set(
        input.findings
          .filter((finding) => finding.severity === "high" || finding.severity === "medium")
          .map((finding) => finding.remediation)
      )
    ).slice(0, 4);

    if (recommendedActions.length === 0) {
      const limitedFinding = input.findings.find(
        (finding) =>
          finding.id === "content-access-challenge" ||
          finding.id.startsWith("content-root-http-")
      );
      if (limitedFinding) {
        recommendedActions.push(limitedFinding.remediation);
      }
    }

    if (recommendedActions.length === 0) {
      recommendedActions.push(
        "Keep monitoring the public surface and supplement this passive scan with authenticated testing where appropriate."
      );
    }

    return {
      riskLevel: this.deriveRiskLevel(input.findingCounts, input.securityScore),
      headline: this.buildSummaryHeadline({
        findings: input.findings,
        findingCounts: input.findingCounts,
        pagesScanned: input.pages.length,
        securityScore: input.securityScore
      }),
      strengths: strengths.slice(0, 5),
      topRisks,
      recommendedActions
    };
  }

  private buildSummaryHeadline(input: {
    findings: WebsiteScanFinding[];
    findingCounts: Record<WebsiteFindingSeverity, number>;
    pagesScanned: number;
    securityScore: number;
  }): string {
    if (
      input.findings.some((finding) => finding.id === "transport-invalid-tls-certificate")
    ) {
      return `The passive scan identified an HTTPS certificate trust failure on the public entry point, so transport security should be fixed before relying on deeper browser-facing findings.`;
    }

    if (input.findings.some((finding) => finding.id === "content-access-challenge")) {
      return `The passive scan reached an anti-bot or access challenge on the public entry point, so only ${input.pagesScanned} accessible page(s) were assessed.`;
    }

    if (
      input.findings.some((finding) => finding.id.startsWith("content-root-http-"))
    ) {
      return `The passive scan reached an HTTP error page on the public entry point, so only ${input.pagesScanned} accessible page(s) were assessed.`;
    }

    if (
      input.findings.some((finding) =>
        /^(exposure-api-data-|exposure-database-interface-|exposure-internal-service-|exposure-sensitive-file-)/.test(
          finding.id
        )
      )
    ) {
      return `The passive scan covered ${input.pagesScanned} page(s) and confirmed public-facing API, management, or configuration exposure that should be remediated before deeper expansion work.`;
    }

    if (input.findingCounts.high > 0) {
      return `The passive scan covered ${input.pagesScanned} page(s) and found ${input.findingCounts.high} high-severity issue(s) that should be remediated first.`;
    }

    if (input.findingCounts.medium > 0) {
      return `The passive scan covered ${input.pagesScanned} page(s) and found ${input.findingCounts.medium} medium-severity hardening gap(s).`;
    }

    if (input.findingCounts.low > 0 || input.findingCounts.info > 0) {
      return `The passive scan covered ${input.pagesScanned} page(s) and found only lower-severity issues. The current score is ${input.securityScore}/100.`;
    }

    return `The passive scan covered ${input.pagesScanned} page(s) and did not detect immediate browser-hardening or public service exposure in the sampled surface.`;
  }

  private deriveRiskLevel(
    findingCounts: Record<WebsiteFindingSeverity, number>,
    securityScore: number
  ): WebsiteScanSummary["riskLevel"] {
    if (findingCounts.high >= 3 || securityScore < 40) {
      return "critical";
    }
    if (findingCounts.high > 0 || findingCounts.medium >= 4 || securityScore < 70) {
      return "high";
    }
    if (findingCounts.medium > 0 || findingCounts.low >= 4 || securityScore < 85) {
      return "medium";
    }
    return "low";
  }

  private readSetCookies(headers: Headers): string[] {
    const nodeHeaders = headers as Headers & {
      getSetCookie?: () => string[];
    };
    if (typeof nodeHeaders.getSetCookie === "function") {
      return nodeHeaders.getSetCookie().filter(Boolean);
    }

    const single = headers.get("set-cookie");
    return single ? [single] : [];
  }

  private countSameOriginDiscovered(pages: PageAnalysis[]): number {
    const discovered = new Set<string>();
    for (const page of pages) {
      for (const link of page.links) {
        if (new URL(page.url).origin === link.origin) {
          discovered.add(this.canonicalizeUrl(link));
        }
      }
    }

    return discovered.size;
  }

  private countExternalLinksDiscovered(pages: PageAnalysis[]): number {
    const discovered = new Set<string>();
    for (const page of pages) {
      for (const link of page.links) {
        if (new URL(page.url).origin !== link.origin) {
          discovered.add(this.canonicalizeUrl(link));
        }
      }
    }

    return discovered.size;
  }

  private countFindings(
    findings: WebsiteScanFinding[]
  ): Record<WebsiteFindingSeverity, number> {
    return findings.reduce<Record<WebsiteFindingSeverity, number>>(
      (counts, finding) => {
        counts[finding.severity] += 1;
        return counts;
      },
      {
        info: 0,
        low: 0,
        medium: 0,
        high: 0
      }
    );
  }

  private calculateSecurityScore(findings: WebsiteScanFinding[]): number {
    const penaltyBySeverity: Record<WebsiteFindingSeverity, number> = {
      info: 2,
      low: 5,
      medium: 11,
      high: 20
    };

    const penalty = findings.reduce((total, finding) => {
      if (finding.id === "transport-invalid-tls-certificate") {
        return total + 45;
      }

      return total + penaltyBySeverity[finding.severity];
    }, 0);

    return Math.max(0, 100 - penalty);
  }

  private scoreToGrade(score: number): WebsiteScanResult["grade"] {
    if (score >= 90) {
      return "A";
    }
    if (score >= 80) {
      return "B";
    }
    if (score >= 70) {
      return "C";
    }
    if (score >= 60) {
      return "D";
    }
    return "F";
  }

  private extractForms(
    html: string,
    pageUrl: URL
  ): Array<{
    hasPasswordField: boolean;
    externalAction: boolean;
    insecurePasswordSubmit: boolean;
  }> {
    const forms: Array<{
      hasPasswordField: boolean;
      externalAction: boolean;
      insecurePasswordSubmit: boolean;
    }> = [];

    const matches = html.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi);
    for (const match of matches) {
      const attributes = match[1] ?? "";
      const body = match[2] ?? "";
      const action = this.readAttribute(attributes, "action");
      const resolvedAction = action ? this.resolveUrl(pageUrl, action) : null;
      const hasPasswordField = /<input[^>]+type=["']password["'][^>]*>/i.test(body);
      const externalAction = Boolean(
        resolvedAction && resolvedAction.origin !== pageUrl.origin
      );
      const insecurePasswordSubmit = Boolean(
        hasPasswordField &&
          (pageUrl.protocol !== "https:" ||
            (resolvedAction ? resolvedAction.protocol !== "https:" : false))
      );

      forms.push({
        hasPasswordField,
        externalAction,
        insecurePasswordSubmit
      });
    }

    return forms;
  }

  private extractLinks(html: string, pageUrl: URL): URL[] {
    const links: URL[] = [];
    const matches = html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi);
    for (const match of matches) {
      const href = match[1]?.trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) {
        continue;
      }

      const resolved = this.resolveUrl(pageUrl, href);
      if (resolved) {
        links.push(resolved);
      }
    }

    return links;
  }

  private extractScriptInsights(
    html: string,
    pageUrl: URL
  ): {
    inlineScriptCount: number;
    externalScriptCount: number;
    thirdPartyScriptCount: number;
  } {
    const inlineScriptCount = Array.from(
      html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)
    ).length;

    let externalScriptCount = 0;
    let thirdPartyScriptCount = 0;

    const matches = html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
    for (const match of matches) {
      const src = match[1]?.trim();
      if (!src) {
        continue;
      }

      externalScriptCount += 1;
      const resolved = this.resolveUrl(pageUrl, src);
      if (resolved && resolved.origin !== pageUrl.origin) {
        thirdPartyScriptCount += 1;
      }
    }

    return {
      inlineScriptCount,
      externalScriptCount,
      thirdPartyScriptCount
    };
  }

  private countMixedContentReferences(html: string): number {
    return Array.from(
      html.matchAll(/\b(?:src|href|action)=["']http:\/\/[^"']+["']/gi)
    ).length;
  }

  private detectDirectoryListing(title: string, html: string): boolean {
    return /index of\s*\//i.test(title) || /<h1[^>]*>\s*index of\s*\//i.test(html);
  }

  private extractMetaGenerator(html: string): string | null {
    const match = html.match(
      /<meta[^>]+name=["']generator["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    );
    return match?.[1] ? this.cleanHtmlText(match[1]) : null;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return this.cleanHtmlText(match?.[1] ?? "Untitled page");
  }

  private readAttribute(source: string, attribute: string): string | null {
    const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i");
    return source.match(pattern)?.[1] ?? null;
  }

  private resolveUrl(base: URL, value: string): URL | null {
    try {
      return new URL(value, base);
    } catch {
      return null;
    }
  }

  private cleanHtmlText(value: string): string {
    return value
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isPreviewTextLike(contentType: string): boolean {
    if (!contentType) {
      return true;
    }

    return (
      contentType.startsWith("text/") ||
      /json|javascript|xml|html|graphql|yaml|svg/i.test(contentType)
    );
  }

  private isHtmlLike(contentType: string): boolean {
    return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
  }

  private getContentType(response: Response): string {
    return response.headers.get("content-type")?.toLowerCase() ?? "";
  }

  private canonicalizeUrl(url: URL): string {
    const next = new URL(url.toString());
    next.hash = "";
    return next.toString();
  }

  private stripHash(url: URL): URL {
    const next = new URL(url.toString());
    next.hash = "";
    return next;
  }

  private headersFromRecord(values: Record<string, string>): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(values)) {
      const normalizedName = name.trim().toLowerCase();
      const normalizedValue = value.replace(/[\r\n]+/g, ", ").trim();
      if (!normalizedName || !normalizedValue) {
        continue;
      }

      try {
        headers.set(normalizedName, normalizedValue);
      } catch {
        continue;
      }
    }

    return headers;
  }

  private mergeWarnings(...collections: string[][]): string[] {
    const warnings: string[] = [];
    for (const collection of collections) {
      for (const warning of collection) {
        this.pushWarning(warnings, warning);
      }
    }

    return warnings;
  }

  private pushWarning(warnings: string[], value: string): void {
    if (warnings.includes(value) || warnings.length >= 8) {
      return;
    }

    warnings.push(value);
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

  private looksVersioned(value: string): boolean {
    return /\/\d|\b\d+\.\d+/.test(value);
  }

  private redactVersionTokens(value: string): string {
    return value
      .replace(/\/\d[\w.-]*/g, "/<version>")
      .replace(/\b\d+\.\d+(?:\.\d+)?(?:[-\w]*)?\b/g, "<version>");
  }

  private async inspectHttpRedirect(url: URL): Promise<{
    redirectedToHttps: boolean;
  }> {
    if (url.protocol === "http:") {
      return {
        redirectedToHttps: false
      };
    }

    const httpUrl = new URL(url.toString());
    httpUrl.protocol = "http:";

    try {
      const probe = await this.fetchFollowingRedirects(httpUrl, false);
      probe.response.body?.cancel();

      return {
        redirectedToHttps: probe.finalUrl.protocol === "https:"
      };
    } catch {
      return {
        redirectedToHttps: false
      };
    }
  }

  private async fetchFollowingRedirects(
    url: URL,
    expectBody = true,
    options: {
      allowErrorStatus?: boolean;
    } = {}
  ): Promise<RedirectedResponse> {
    let current = new URL(url.toString());

    for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
      await this.assertSafePublicUrl(current);
      const response = await this.fetchSingle(current);

      if (this.isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        response.body?.cancel();

        if (!location) {
          throw new AppError("Received a redirect response without a Location header.", 502, {
            url: current.toString(),
            statusCode: response.status
          });
        }

        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new AppError("Received an invalid redirect target.", 502, {
            url: current.toString(),
            location
          });
        }

        current = next;
        continue;
      }

      if (!response.ok && !options.allowErrorStatus) {
        throw new AppError(`Website request returned ${response.status}.`, 502, {
          url: current.toString(),
          statusCode: response.status
        });
      }

      if (!expectBody) {
        return {
          finalUrl: current,
          response
        };
      }

      return {
        finalUrl: current,
        response
      };
    }

    throw new AppError("Too many redirects while scanning the website.", 502, {
      url: url.toString()
    });
  }

  private isRedirectStatus(statusCode: number): boolean {
    return [301, 302, 303, 307, 308].includes(statusCode);
  }

  private async fetchSingle(url: URL): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      return await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.4,*/*;q=0.1",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        }
      });
    } catch (error) {
      const failure = this.classifyFetchError(error);
      throw new AppError("Failed to fetch website content.", 502, {
        url: url.toString(),
        reason: failure.reason,
        kind: failure.kind
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private describeFetchError(error: unknown): string {
    return this.classifyFetchError(error).reason;
  }

  private classifyFetchError(error: unknown): {
    reason: string;
    kind?:
      | "hostname_unresolved"
      | "connection_refused"
      | "connection_reset"
      | "timeout"
      | "tls_certificate_invalid";
  } {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        reason: "The website did not respond within 15 seconds.",
        kind: "timeout"
      };
    }

    if (error && typeof error === "object" && "cause" in error) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause && typeof cause === "object") {
        const message = "message" in cause ? cause.message : undefined;
        const code = "code" in cause ? cause.code : undefined;

        if (typeof code === "string") {
          switch (code) {
            case "ENOTFOUND":
            case "EAI_AGAIN":
              return {
                reason: "The website hostname could not be resolved.",
                kind: "hostname_unresolved"
              };
            case "ECONNREFUSED":
              return {
                reason: "The remote server refused the connection.",
                kind: "connection_refused"
              };
            case "ECONNRESET":
              return {
                reason: "The remote server reset the connection.",
                kind: "connection_reset"
              };
            case "ETIMEDOUT":
            case "UND_ERR_CONNECT_TIMEOUT":
            case "UND_ERR_HEADERS_TIMEOUT":
            case "UND_ERR_BODY_TIMEOUT":
              return {
                reason: "The website did not respond before the scanner timed out.",
                kind: "timeout"
              };
            case "CERT_HAS_EXPIRED":
            case "DEPTH_ZERO_SELF_SIGNED_CERT":
            case "ERR_TLS_CERT_ALTNAME_INVALID":
            case "SELF_SIGNED_CERT_IN_CHAIN":
            case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
            case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
            case "CERT_UNTRUSTED":
              return {
                reason: "The website TLS certificate could not be validated.",
                kind: "tls_certificate_invalid"
              };
            default:
              break;
          }
        }

        if (typeof message === "string" && message.trim()) {
          if (
            /unable to verify the first certificate|self[- ]signed|certificate.*expired|altname invalid|issuer certificate/i.test(
              message
            )
          ) {
            return {
              reason: "The website TLS certificate could not be validated.",
              kind: "tls_certificate_invalid"
            };
          }

          return {
            reason: message
          };
        }
      }
    }

    if (error instanceof Error && error.message.trim() && error.message !== "fetch failed") {
      if (
        /unable to verify the first certificate|self[- ]signed|certificate.*expired|altname invalid|issuer certificate/i.test(
          error.message
        )
      ) {
        return {
          reason: "The website TLS certificate could not be validated.",
          kind: "tls_certificate_invalid"
        };
      }

      return {
        reason: error.message
      };
    }

    return {
      reason: "Unknown fetch failure"
    };
  }

  private async assertSafePublicUrl(url: URL): Promise<void> {
    if (
      this.isBlockedHostname(url.hostname) &&
      !this.allowDevelopmentLocalTargets
    ) {
      throw new AppError("Local and private network targets are blocked.", 403, {
        hostname: url.hostname
      });
    }

    if (this.isBlockedHostname(url.hostname)) {
      return;
    }

    const records = await this.lookupHost(url.hostname, {
      all: true,
      verbatim: true
    }).catch(() => []);

    if (records.length === 0) {
      throw new AppError("Unable to resolve website hostname.", 400, {
        hostname: url.hostname
      });
    }

    for (const record of records) {
      if (
        this.isPrivateAddress(record.address) &&
        !this.allowDevelopmentLocalTargets
      ) {
        throw new AppError("Resolved address is in a blocked private range.", 403, {
          hostname: url.hostname,
          address: record.address
        });
      }
    }
  }

  private isBlockedHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();

    return (
      normalized === "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized.endsWith(".local") ||
      normalized === "0.0.0.0" ||
      normalized === "::1" ||
      normalized === "169.254.169.254"
    );
  }

  private isPrivateAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
      return this.isPrivateIpv4(address);
    }

    if (version === 6) {
      return this.isPrivateIpv6(address);
    }

    return true;
  }

  private isPrivateIpv4(address: string): boolean {
    const [a = -1, b = -1] = address
      .split(".")
      .map((segment) => Number(segment));

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  private isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);

    if (mappedIpv4?.[1]) {
      return this.isPrivateIpv4(mappedIpv4[1]);
    }

    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized === "::"
    );
  }
}
