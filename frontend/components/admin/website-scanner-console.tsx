"use client";

import { useState } from "react";
import {
  Globe,
  LockKeyhole,
  Radar,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";

import { scanWebsiteSecurity } from "@/lib/api";
import {
  AdminWebsiteScan,
  WebsiteFindingSeverity
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

function severityBadgeClass(severity: WebsiteFindingSeverity) {
  switch (severity) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function gradeBadgeClass(grade: AdminWebsiteScan["grade"]) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
    case "F":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function riskBadgeClass(riskLevel: AdminWebsiteScan["summary"]["riskLevel"]) {
  switch (riskLevel) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function resourceBadgeClass(resource: AdminWebsiteScan["resources"][number]) {
  switch (resource.status) {
    case "present":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "missing":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function normalizeScanTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function WebsiteScannerConsole() {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(4);
  const [result, setResult] = useState<AdminWebsiteScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  async function handleScan() {
    const target = normalizeScanTarget(url);

    if (!target) {
      setError(t("websiteScanner.urlRequired"));
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      const nextResult = await scanWebsiteSecurity({
        url: target,
        maxPages
      });
      setResult(nextResult);
    } catch (scanError) {
      setError(
        scanError instanceof Error ? scanError.message : t("websiteScanner.scanFailed")
      );
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Card className="space-y-5 bg-white/82">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">
            {t("websiteScanner.label")}
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">
            {t("websiteScanner.title")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {t("websiteScanner.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 lg:max-w-md">
          <p className="font-semibold text-amber-900">
            {t("websiteScanner.policyTitle")}
          </p>
          <p className="mt-2 leading-6">
            {t("websiteScanner.policyDescription")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px_auto]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
            {t("websiteScanner.urlLabel")}
          </span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("websiteScanner.urlPlaceholder")}
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
            {t("websiteScanner.maxPages")}
          </span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value) || 1)}
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            void handleScan();
          }}
          disabled={isScanning}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <RefreshCcw className={cn("size-4", isScanning && "animate-spin")} />
          {isScanning ? t("websiteScanner.scanning") : t("websiteScanner.scan")}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("websiteScanner.passiveTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("websiteScanner.passiveDescription")}
          </p>
        </div>
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("websiteScanner.publicOnlyTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("websiteScanner.publicOnlyDescription")}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!result ? (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
          {t("websiteScanner.empty")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-black/45">
            <span>
              {t("websiteScanner.lastScanned", {
                value: formatDateTime(result.scannedAt)
              })}
            </span>
            <span>
              {t("websiteScanner.finalUrl")}: {result.finalUrl}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-[24px] border border-black/6 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(29,78,216,0.94)_100%)] p-5 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={gradeBadgeClass(result.grade)}>{result.grade}</Badge>
                <Badge className={riskBadgeClass(result.summary.riskLevel)}>
                  {t(`websiteScanner.riskLevels.${result.summary.riskLevel}`)}
                </Badge>
                <Badge>
                  {t(`websiteScanner.analysisModes.${result.analysis.mode}`)}
                </Badge>
                <span className="text-xs uppercase tracking-[0.18em] text-white/65">
                  {t("websiteScanner.score")} {formatNumber(result.securityScore)}/100
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold">
                {t("websiteScanner.executiveSummary")}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/82">
                {result.summary.headline}
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("websiteScanner.strengths")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.strengths.length === 0 ? (
                      <p>{t("websiteScanner.noneRecorded")}</p>
                    ) : (
                      result.summary.strengths.map((entry) => <p key={entry}>{entry}</p>)
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("websiteScanner.topRisks")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.topRisks.length === 0 ? (
                      <p>{t("websiteScanner.noFindings")}</p>
                    ) : (
                      result.summary.topRisks.map((entry) => <p key={entry}>{entry}</p>)
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("websiteScanner.priorityActions")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.recommendedActions.map((entry) => (
                      <p key={entry}>{entry}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                  {t("websiteScanner.crawlCoverage")}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("websiteScanner.pagesScanned")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                      {formatNumber(result.crawl.scannedPages)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("websiteScanner.failedPages")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-red-700">
                      {formatNumber(result.crawl.failedPages)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("websiteScanner.sameOrigin")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      {formatNumber(result.crawl.discoveredSameOriginPages)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("websiteScanner.externalLinks")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      {formatNumber(result.crawl.discoveredExternalLinks)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-black/6 pt-4 text-sm text-[var(--text-secondary)]">
                  <p>
                    {t("websiteScanner.analysisMode")}:{" "}
                    {t(`websiteScanner.analysisModes.${result.analysis.mode}`)}
                  </p>
                  {result.analysis.browserEngine ? (
                    <p>
                      {t("websiteScanner.browserEngine")}: {result.analysis.browserEngine}
                    </p>
                  ) : null}
                </div>
              </div>

              {result.warnings.length > 0 ? (
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                    {t("websiteScanner.scanNotes")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
                    {result.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.score")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-2xl font-semibold text-[var(--text-primary)]">
                  {formatNumber(result.securityScore)}
                </p>
                <Badge className={gradeBadgeClass(result.grade)}>{result.grade}</Badge>
              </div>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.pagesScanned")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(result.pagesScanned)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.highFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-red-700">
                {formatNumber(result.findingCounts.high)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.mediumFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-amber-700">
                {formatNumber(result.findingCounts.medium)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.lowFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-sky-700">
                {formatNumber(result.findingCounts.low)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("websiteScanner.infoFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-700">
                {formatNumber(result.findingCounts.info)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <LockKeyhole className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("websiteScanner.transport")}
                </p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                <p>
                  {t("websiteScanner.sameOrigin")}:{" "}
                  {formatNumber(result.sameOriginPagesDiscovered)}
                </p>
                <p>
                  {t("websiteScanner.redirectedHttps")}:{" "}
                  {result.transport.redirectedToHttps
                    ? t("common.status.ready")
                    : t("common.status.failed")}
                </p>
                <p>
                  {t("websiteScanner.hsts")}:{" "}
                  {result.transport.hstsEnabled
                    ? t("common.status.ready")
                    : t("common.status.failed")}
                </p>
                {result.transport.finalProtocol === "https" ? (
                  <p>
                    {t("websiteScanner.tlsCertificate")}:{" "}
                    {result.transport.certificateTrusted
                      ? t("common.status.ready")
                      : t("common.status.failed")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("websiteScanner.cookies")}
                </p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                <p>
                  {t("websiteScanner.cookieTotal")}: {formatNumber(result.cookies.total)}
                </p>
                <p>
                  {t("websiteScanner.missingSecure")}:{" "}
                  {formatNumber(result.cookies.missingSecure)}
                </p>
                <p>
                  {t("websiteScanner.missingHttpOnly")}:{" "}
                  {formatNumber(result.cookies.missingHttpOnly)}
                </p>
                <p>
                  {t("websiteScanner.missingSameSite")}:{" "}
                  {formatNumber(result.cookies.missingSameSite)}
                </p>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("websiteScanner.headers")}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{result.headers.contentSecurityPolicy ? "CSP" : "No CSP"}</Badge>
                <Badge>{result.headers.xFrameOptions ? "XFO" : "No XFO"}</Badge>
                <Badge>{result.headers.xContentTypeOptions ?? "No nosniff"}</Badge>
                <Badge>{result.headers.referrerPolicy ?? "No Referrer-Policy"}</Badge>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("websiteScanner.surface")}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                <p>{t("websiteScanner.forms")}: {formatNumber(result.surface.totalForms)}</p>
                <p>{t("websiteScanner.loginForms")}: {formatNumber(result.surface.loginForms)}</p>
                <p>{t("websiteScanner.externalForms")}: {formatNumber(result.surface.externalFormActions)}</p>
                <p>{t("websiteScanner.insecureForms")}: {formatNumber(result.surface.insecurePasswordSubmissions)}</p>
                <p>{t("websiteScanner.inlineScripts")}: {formatNumber(result.surface.inlineScripts)}</p>
                <p>{t("websiteScanner.externalScripts")}: {formatNumber(result.surface.externalScripts)}</p>
                <p>{t("websiteScanner.thirdPartyScripts")}: {formatNumber(result.surface.thirdPartyScripts)}</p>
                <p>{t("websiteScanner.mixedContent")}: {formatNumber(result.surface.mixedContentReferences)}</p>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("websiteScanner.exposure")}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                <p>{t("websiteScanner.probedEndpoints")}: {formatNumber(result.exposures.probedEndpoints)}</p>
                <p>{t("websiteScanner.apiDocs")}: {formatNumber(result.exposures.publicApiDocs)}</p>
                <p>{t("websiteScanner.apiEndpoints")}: {formatNumber(result.exposures.publicApiEndpoints)}</p>
                <p>{t("websiteScanner.databaseInterfaces")}: {formatNumber(result.exposures.publicDatabaseInterfaces)}</p>
                <p>{t("websiteScanner.internalServices")}: {formatNumber(result.exposures.publicInternalServices)}</p>
                <p>{t("websiteScanner.sensitiveFiles")}: {formatNumber(result.exposures.sensitiveFiles)}</p>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("websiteScanner.resources")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.resources.map((resource) => (
                  <Badge
                    key={resource.name}
                    className={resourceBadgeClass(resource)}
                  >
                    {resource.name}{" "}
                    {resource.statusCode !== null ? `(${resource.statusCode})` : ""}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("websiteScanner.fingerprints")}
              </p>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                {result.fingerprints.length === 0 ? (
                  <p>{t("websiteScanner.noneRecorded")}</p>
                ) : (
                  result.fingerprints.map((fingerprint) => (
                    <p key={`${fingerprint.source}-${fingerprint.sanitizedValue}`}>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {fingerprint.source}
                      </span>
                      : {fingerprint.sanitizedValue}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-black/45">
                  {t("websiteScanner.findings")}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {t("websiteScanner.findingsTitle")}
                </h3>
              </div>

              {result.findings.length === 0 ? (
                <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  {t("websiteScanner.noFindings")}
                </div>
              ) : (
                result.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={severityBadgeClass(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <Badge>{t(`websiteScanner.categories.${finding.category}`)}</Badge>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {finding.title}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {finding.summary}
                    </p>
                    {finding.pageUrl ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        {t("websiteScanner.page")}: {finding.pageUrl}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {t("websiteScanner.remediation")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {finding.remediation}
                    </p>
                    {finding.evidence.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {finding.evidence.map((entry) => (
                          <Badge key={`${finding.id}-${entry}`}>{entry}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-black/45">
                  {t("websiteScanner.pages")}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {t("websiteScanner.pagesTitle")}
                </h3>
              </div>

              {result.pages.map((page) => (
                <div
                  key={page.url}
                  className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {page.title}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {page.url}
                      </p>
                    </div>
                    <Badge>{page.statusCode}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.forms")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.formCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.loginForms")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.loginFormCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.externalForms")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.externalFormActionCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.mixedContent")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.mixedContentCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.links")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.linkCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.externalLinks")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.externalLinkCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.thirdPartyScripts")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.thirdPartyScriptCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("websiteScanner.insecureForms")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {formatNumber(page.insecurePasswordSubmitCount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
