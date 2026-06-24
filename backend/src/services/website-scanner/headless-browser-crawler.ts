import { lookup } from "dns/promises";
import { existsSync } from "fs";
import { isIP } from "net";

export interface BrowserObservedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict" | "None" | "Unset";
}

export interface BrowserPageSnapshot {
  url: string;
  html: string;
  statusCode: number;
  contentType: string;
}

export interface BrowserCrawlResult {
  browserEngine: string;
  finalUrl: string;
  rootHeaders: Record<string, string>;
  cookies: BrowserObservedCookie[];
  pages: BrowserPageSnapshot[];
  warnings: string[];
  attemptedPages: number;
  failedPages: number;
  skippedCrossOriginPages: number;
  skippedNonHtmlPages: number;
  duplicatePagesSkipped: number;
}

export interface BrowserCrawler {
  crawl(input: {
    url: URL;
    maxPages: number;
    ignoreHttpsErrors?: boolean;
  }): Promise<BrowserCrawlResult>;
}

interface HeadlessBrowserCrawlerOptions {
  executablePath: string;
  allowDevelopmentLocalTargets?: boolean;
  lookupHost?: typeof lookup;
  navigationTimeoutMs?: number;
  challengeSettleDelayMs?: number;
}

interface CapturedBrowserPage {
  snapshot: BrowserPageSnapshot;
  headers: Record<string, string>;
  cookies: BrowserObservedCookie[];
}

export function resolveBrowserExecutablePath(preferredPath?: string): string | null {
  const candidates = [
    preferredPath,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium"
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export class HeadlessBrowserCrawler implements BrowserCrawler {
  private readonly lookupHost: typeof lookup;
  private readonly allowDevelopmentLocalTargets: boolean;
  private readonly navigationTimeoutMs: number;
  private readonly challengeSettleDelayMs: number;

  constructor(private readonly options: HeadlessBrowserCrawlerOptions) {
    this.lookupHost = options.lookupHost ?? lookup;
    this.allowDevelopmentLocalTargets =
      options.allowDevelopmentLocalTargets === true;
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 20_000;
    this.challengeSettleDelayMs = options.challengeSettleDelayMs ?? 4_000;
  }

  async crawl(input: {
    url: URL;
    maxPages: number;
    ignoreHttpsErrors?: boolean;
  }): Promise<BrowserCrawlResult> {
    const playwright = await import("playwright-core");
    const browser = await playwright.chromium.launch({
      executablePath: this.options.executablePath,
      headless: true,
      args:
        process.platform === "linux"
          ? ["--disable-dev-shm-usage", "--no-sandbox"]
          : ["--disable-dev-shm-usage"]
    });

    const context = await browser.newContext({
      viewport: {
        width: 1440,
        height: 900
      },
      ignoreHTTPSErrors: input.ignoreHttpsErrors === true,
      javaScriptEnabled: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const warnings: string[] = [];
    const blockedHosts = new Set<string>();
    const safeHostCache = new Map<string, Promise<void>>();

    const assertSafePublicUrlCached = (url: URL) => {
      const key = `${url.protocol}//${url.hostname}`.toLowerCase();
      const existing = safeHostCache.get(key);
      if (existing) {
        return existing;
      }

      const pending = this.assertSafePublicUrl(url);
      safeHostCache.set(key, pending);
      return pending;
    };

    await context.route("**/*", async (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "media", "font", "websocket"].includes(resourceType)) {
        await route.abort("blockedbyclient").catch(async () => {
          await route.abort();
        });
        return;
      }

      let requestUrl: URL;
      try {
        requestUrl = new URL(route.request().url());
      } catch {
        await route.continue();
        return;
      }

      if (!["http:", "https:"].includes(requestUrl.protocol)) {
        await route.continue();
        return;
      }

      try {
        await assertSafePublicUrlCached(requestUrl);
        await route.continue();
      } catch {
        blockedHosts.add(requestUrl.hostname);
        await route.abort("blockedbyclient").catch(async () => {
          await route.abort();
        });
      }
    });

    try {
      const pages: BrowserPageSnapshot[] = [];
      const queue: URL[] = [this.stripHash(input.url)];
      const queued = new Set([this.canonicalizeUrl(input.url)]);
      const visited = new Set<string>();
      const origin = input.url.origin;
      let failedPages = 0;
      let skippedCrossOriginPages = 0;
      let skippedNonHtmlPages = 0;
      let duplicatePagesSkipped = 0;
      let rootHeaders: Record<string, string> = {};
      let rootCookies: BrowserObservedCookie[] = [];
      let rootFinalUrl = input.url.toString();

      while (queue.length > 0 && pages.length < input.maxPages) {
        const next = queue.shift();
        if (!next) {
          continue;
        }

        const key = this.canonicalizeUrl(next);
        queued.delete(key);

        if (visited.has(key)) {
          duplicatePagesSkipped += 1;
          continue;
        }

        visited.add(key);

        try {
          const captured = await this.capturePage(context, next, assertSafePublicUrlCached);
          if (!captured) {
            skippedNonHtmlPages += 1;
            continue;
          }

          const finalUrl = new URL(captured.snapshot.url);
          if (finalUrl.origin !== origin) {
            skippedCrossOriginPages += 1;
            this.pushWarning(
              warnings,
              `Skipped ${finalUrl.toString()} because browser navigation left the original origin.`
            );
            continue;
          }

          pages.push(captured.snapshot);
          if (pages.length === 1) {
            rootHeaders = captured.headers;
            rootCookies = captured.cookies;
            rootFinalUrl = captured.snapshot.url;
          }

          const links = this.extractLinks(captured.snapshot.html, finalUrl);
          for (const link of links) {
            if (link.origin !== origin) {
              continue;
            }

            const normalized = this.stripHash(link);
            const normalizedKey = this.canonicalizeUrl(normalized);
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
            `Browser crawl failed for ${next.toString()}: ${
              error instanceof Error ? error.message : "Unknown browser error"
            }`
          );
        }
      }

      for (const host of blockedHosts) {
        this.pushWarning(
          warnings,
          `Blocked a private-network browser request to ${host}.`
        );
      }

      if (pages.length === 0) {
        throw new Error("Browser crawl did not return any HTML pages.");
      }

      return {
        browserEngine: browser.version(),
        finalUrl: rootFinalUrl,
        rootHeaders,
        cookies: rootCookies,
        pages,
        warnings,
        attemptedPages: visited.size,
        failedPages,
        skippedCrossOriginPages,
        skippedNonHtmlPages,
        duplicatePagesSkipped
      };
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  private async capturePage(
    context: {
      newPage: () => Promise<{
        setDefaultNavigationTimeout: (timeout: number) => void;
        goto: (
          url: string,
          options: {
            waitUntil: "domcontentloaded";
            timeout: number;
          }
        ) => Promise<
          | {
              headers: () => Record<string, string>;
              status: () => number;
            }
          | null
        >;
        waitForLoadState: (
          state: "networkidle",
          options: { timeout: number }
        ) => Promise<void>;
        content: () => Promise<string>;
        title: () => Promise<string>;
        waitForTimeout: (timeout: number) => Promise<void>;
        url: () => string;
        close: () => Promise<void>;
      }>;
      cookies: (urls: string[]) => Promise<
        Array<{
          name: string;
          secure: boolean;
          httpOnly: boolean;
          sameSite?: "Lax" | "Strict" | "None";
        }>
      >;
    },
    target: URL,
    assertSafePublicUrlCached: (url: URL) => Promise<void>
  ): Promise<CapturedBrowserPage | null> {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(this.navigationTimeoutMs);

    try {
      const response = await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: this.navigationTimeoutMs
      });

      await page.waitForLoadState("networkidle", {
        timeout: 4_000
      }).catch(() => undefined);

      let html = await page.content();
      let title = await page.title();
      if (this.looksLikeAccessChallenge(title, html)) {
        await page.waitForTimeout(this.challengeSettleDelayMs);
        html = await page.content();
        title = await page.title();
      }

      const finalUrl = new URL(page.url());
      await assertSafePublicUrlCached(finalUrl);

      const contentType = response?.headers()["content-type"]?.toLowerCase() ?? "text/html";
      if (!this.isHtmlLike(contentType)) {
        return null;
      }

      const cookies: BrowserObservedCookie[] = (
        await context.cookies([finalUrl.toString()])
      ).map((cookie): BrowserObservedCookie => ({
        name: cookie.name,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite:
          cookie.sameSite === "Lax" ||
          cookie.sameSite === "Strict" ||
          cookie.sameSite === "None"
            ? cookie.sameSite
            : "Unset"
      }));

      return {
        snapshot: {
          url: finalUrl.toString(),
          html,
          statusCode: response?.status() ?? 200,
          contentType
        },
        headers: response?.headers() ?? {},
        cookies
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private extractLinks(html: string, pageUrl: URL): URL[] {
    const links: URL[] = [];
    const matches = html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi);
    for (const match of matches) {
      const href = match[1]?.trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) {
        continue;
      }

      try {
        links.push(new URL(href, pageUrl));
      } catch {
        continue;
      }
    }

    return links;
  }

  private looksLikeAccessChallenge(title: string, html: string): boolean {
    const text = `${title}\n${html.slice(0, 6000)}`.toLowerCase();
    const patterns = [
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

    return patterns.some((pattern) => pattern.test(text));
  }

  private isHtmlLike(contentType: string): boolean {
    return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
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

  private pushWarning(warnings: string[], value: string): void {
    if (warnings.includes(value) || warnings.length >= 8) {
      return;
    }

    warnings.push(value);
  }

  private async assertSafePublicUrl(url: URL): Promise<void> {
    if (
      this.isBlockedHostname(url.hostname) &&
      !this.allowDevelopmentLocalTargets
    ) {
      throw new Error("Local and private network targets are blocked.");
    }

    if (this.isBlockedHostname(url.hostname)) {
      return;
    }

    const records = await this.lookupHost(url.hostname, {
      all: true,
      verbatim: true
    }).catch(() => []);

    if (records.length === 0) {
      throw new Error(`Unable to resolve ${url.hostname}.`);
    }

    for (const record of records) {
      if (
        this.isPrivateAddress(record.address) &&
        !this.allowDevelopmentLocalTargets
      ) {
        throw new Error(`Resolved ${url.hostname} to blocked address ${record.address}.`);
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
