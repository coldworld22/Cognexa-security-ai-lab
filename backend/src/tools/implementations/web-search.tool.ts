import { lookup } from "dns/promises";
import { isIP } from "net";

import { AppError } from "../../utils/app-error";
import { BaseTool } from "../base-tool";

interface WebSearchInput {
  query?: string;
  url?: string;
  maxContentChars?: number;
  maxResults?: number;
}

interface WebSearchToolDependencies {
  fetchImpl?: typeof fetch;
  lookupHost?: typeof lookup;
}

interface WebSearchResult {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  excerpt: string;
  content: string;
  headings: string[];
  statusCode: number;
}

export class WebSearchTool extends BaseTool<
  WebSearchInput,
  {
    provider: string;
    results: WebSearchResult[];
  }
> {
  readonly metadata = {
    name: "web-search",
    description:
      "Search the public web by query or fetch and summarize public webpages by URL with SSRF-safe guardrails.",
    category: "web" as const,
    inputSchema: {
      query: "string?",
      url: "string?",
      maxContentChars: "number?",
      maxResults: "number?"
    }
  };

  private readonly fetchImpl: typeof fetch;
  private readonly lookupHost: typeof lookup;

  constructor(dependencies: WebSearchToolDependencies = {}) {
    super();
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.lookupHost = dependencies.lookupHost ?? lookup;
  }

  async execute(input: WebSearchInput) {
    const targetUrl = this.resolveTargetUrl(input);
    if (!targetUrl) {
      const query = input.query?.trim();
      if (!query) {
        throw new AppError(
          "web-search requires either a full public URL or a non-empty query.",
          400
        );
      }

      return {
        provider: "bing-search",
        results: await this.searchPublicWeb(query, input.maxResults ?? 5)
      };
    }

    const safeUrl = await this.assertSafePublicUrl(targetUrl);
    const summary = await this.fetchWebsiteSummary(
      safeUrl,
      input.maxContentChars ?? 3200
    );

    return {
      provider: "direct-fetch",
      results: [summary]
    };
  }

  private resolveTargetUrl(input: WebSearchInput): URL | null {
    const raw =
      input.url?.trim() ??
      this.extractUrl(input.query ?? "");

    if (!raw) {
      return null;
    }

    try {
      return new URL(raw);
    } catch {
      throw new AppError("Invalid URL provided to web-search.", 400, {
        url: raw
      });
    }
  }

  private extractUrl(query: string): string | null {
    const match = query.match(/https?:\/\/[^\s)>\]]+/i);
    return match?.[0] ?? null;
  }

  private async assertSafePublicUrl(url: URL): Promise<URL> {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new AppError("Only http and https URLs are allowed.", 400, {
        protocol: url.protocol
      });
    }

    if (url.username || url.password) {
      throw new AppError("Credentials in URLs are not allowed.", 400);
    }

    if (this.isBlockedHostname(url.hostname)) {
      throw new AppError("Local and private network targets are blocked.", 403, {
        hostname: url.hostname
      });
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
      if (this.isPrivateAddress(record.address)) {
        throw new AppError("Resolved address is in a blocked private range.", 403, {
          hostname: url.hostname,
          address: record.address
        });
      }
    }

    return url;
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
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  private isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();

    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized === "::"
    );
  }

  private async fetchWebsiteSummary(url: URL, maxContentChars: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "SecurityAILabBot/0.1 (+https://localhost; public website summary fetcher)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
        }
      });

      if (!response.ok) {
        throw new AppError(`Website request returned ${response.status}.`, 502, {
          url: url.toString(),
          statusCode: response.status
        });
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new AppError("Website content type is not supported for summarization.", 415, {
          url: url.toString(),
          contentType
        });
      }

      const html = await response.text();
      const title = this.extractTitle(html);
      const description = this.extractDescription(html);
      const headings = this.extractHeadings(html).slice(0, 8);
      const content = this.extractReadableText(html, maxContentChars);

      return {
        url: url.toString(),
        finalUrl: response.url,
        title,
        description,
        excerpt: content.slice(0, 600),
        content,
        headings,
        statusCode: response.status
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Failed to fetch website content.", 502, {
        url: url.toString(),
        reason: error instanceof Error ? error.message : "Unknown fetch failure"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchPublicWeb(query: string, maxResults: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const searchUrl = new URL("https://www.bing.com/search");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("setlang", "en-US");
      searchUrl.searchParams.set("cc", "us");
      searchUrl.searchParams.set("adlt", "off");

      const response = await this.fetchImpl(searchUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new AppError(`Search request returned ${response.status}.`, 502, {
          query,
          statusCode: response.status,
          provider: "bing-search"
        });
      }

      const html = await response.text();
      const results = this.parseSearchResults(html, Math.min(Math.max(maxResults, 1), 10));
      if (results.length === 0) {
        throw new AppError("No public search results were returned for the query.", 404, {
          query,
          provider: "bing-search"
        });
      }

      return results;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Failed to search the public web.", 502, {
        query,
        provider: "bing-search",
        reason: error instanceof Error ? error.message : "Unknown search failure"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseSearchResults(html: string, maxResults: number): WebSearchResult[] {
    const blocks = Array.from(html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi))
      .map((match) => match[0])
      .slice(0, maxResults);

    return blocks
      .map<WebSearchResult | null>((block) => {
        const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch?.[1] || !linkMatch[2]) {
          return null;
        }

        const snippetMatch =
          block.match(/<div class="b_caption"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ??
          block.match(/<p>([\s\S]*?)<\/p>/i);

        const url = this.decodeBingResultUrl(linkMatch[1]);
        const title = this.cleanHtmlText(linkMatch[2]);
        const snippet = this.cleanHtmlText(snippetMatch?.[1] ?? "");

        if (!url || !title) {
          return null;
        }

        return {
          url,
          finalUrl: url,
          title,
          description: snippet,
          excerpt: snippet,
          content: snippet,
          headings: [],
          statusCode: 200
        };
      })
      .filter((result): result is WebSearchResult => result !== null);
  }

  private decodeBingResultUrl(rawUrl: string): string {
    try {
      const decoded = this.decodeHtmlEntities(rawUrl);
      const url = new URL(decoded, "https://www.bing.com");
      const redirectTarget = url.searchParams.get("u");

      if (redirectTarget) {
        const decodedRedirectTarget = this.decodeBingRedirectTarget(redirectTarget);
        if (decodedRedirectTarget) {
          return decodedRedirectTarget;
        }

        try {
          return decodeURIComponent(redirectTarget);
        } catch {
          return redirectTarget;
        }
      }

      return url.toString();
    } catch {
      return this.decodeHtmlEntities(rawUrl);
    }
  }

  private decodeBingRedirectTarget(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const encodedValue =
      normalized.startsWith("a1") && normalized.length > 2
        ? normalized.slice(2)
        : normalized;

    const base64 = encodedValue.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);

    try {
      const decoded = Buffer.from(`${base64}${padding}`, "base64").toString("utf-8");
      return decoded.startsWith("http://") || decoded.startsWith("https://")
        ? decoded
        : null;
    } catch {
      return null;
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return this.cleanHtmlText(match?.[1] ?? "Untitled page");
  }

  private extractDescription(html: string): string {
    const patterns = [
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return this.cleanHtmlText(match[1]);
      }
    }

    return "";
  }

  private extractHeadings(html: string): string[] {
    const matches = html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);
    return Array.from(matches)
      .map((match) => this.cleanHtmlText(match[1] ?? ""))
      .filter((heading) => heading.length > 0);
  }

  private extractReadableText(html: string, maxContentChars: number): string {
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<\/(p|div|section|article|main|header|footer|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");

    const normalized = this.cleanHtmlText(stripped)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 40)
      .slice(0, 18)
      .join("\n");

    return normalized.slice(0, maxContentChars);
  }

  private cleanHtmlText(value: string): string {
    return this.decodeHtmlEntities(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
}
