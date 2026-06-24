"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Globe,
  LockKeyhole,
  Radar,
  RefreshCcw,
  Shield,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";

import { runSecurityReviewLab } from "@/lib/api";
import {
  AdminSecurityReviewResult,
  SecurityReviewAttackerEffort,
  SecurityReviewCheckCategory,
  SecurityReviewCheckStatus,
  SecurityReviewConfidence,
  SecurityReviewFindingSeverity
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

function normalizeTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function checkStatusClass(status: SecurityReviewCheckStatus) {
  switch (status) {
    case "pass":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "fail":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function findingSeverityClass(severity: SecurityReviewFindingSeverity) {
  switch (severity) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function gradeBadgeClass(grade: AdminSecurityReviewResult["posture"]["grade"]) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function effortBadgeClass(effort: SecurityReviewAttackerEffort) {
  switch (effort) {
    case "low":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function confidenceBadgeClass(confidence: SecurityReviewConfidence) {
  switch (confidence) {
    case "high":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "medium":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

function priorityBadgeClass(
  priority: AdminSecurityReviewResult["findings"][number]["priority"]
) {
  switch (priority) {
    case "immediate":
      return "border-red-200 bg-red-50 text-red-700";
    case "next":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function riskBadgeClass(riskLevel: AdminSecurityReviewResult["summary"]["riskLevel"]) {
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

function attackPathClass(status: AdminSecurityReviewResult["attackPaths"][number]["status"]) {
  switch (status) {
    case "exposed":
      return "border-red-200 bg-red-50/80";
    case "constrained":
      return "border-amber-200 bg-amber-50/80";
    default:
      return "border-emerald-200 bg-emerald-50/80";
  }
}

function categoryLabel(
  category: SecurityReviewCheckCategory,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`securityReview.categories.${category}`);
}

export function SecurityReviewLabConsole() {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(4);
  const [result, setResult] = useState<AdminSecurityReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const findingCounts = useMemo(() => {
    return (result?.findings ?? []).reduce(
      (counts, finding) => {
        counts[finding.severity] += 1;
        return counts;
      },
      {
        low: 0,
        medium: 0,
        high: 0
      }
    );
  }, [result]);

  const checkNamesById = useMemo(() => {
    return new Map((result?.checks ?? []).map((check) => [check.id, check.name]));
  }, [result]);

  async function handleRun() {
    const target = normalizeTarget(url);

    if (!target) {
      setError(t("securityReview.urlRequired"));
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const review = await runSecurityReviewLab({
        url: target,
        maxPages
      });
      setResult(review);
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : t("securityReview.runFailed")
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card className="space-y-5 bg-white/82">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">
            {t("securityReview.label")}
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">
            {t("securityReview.title")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {t("securityReview.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 lg:max-w-md">
          <p className="font-semibold text-amber-900">
            {t("securityReview.boundaryTitle")}
          </p>
          <p className="mt-2 leading-6">
            {t("securityReview.boundaryDescription")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px_auto]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
            {t("securityReview.urlLabel")}
          </span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("securityReview.urlPlaceholder")}
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
            {t("securityReview.maxPages")}
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
            void handleRun();
          }}
          disabled={isRunning}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <RefreshCcw className={cn("size-4", isRunning && "animate-spin")} />
          {isRunning ? t("securityReview.running") : t("securityReview.run")}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("securityReview.attackerTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("securityReview.attackerDescription")}
          </p>
        </div>
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("securityReview.publicOnlyTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("securityReview.publicOnlyDescription")}
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
          {t("securityReview.empty")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-black/45">
            <span>
              {t("securityReview.lastReviewed", {
                value: formatDateTime(result.reviewedAt)
              })}
            </span>
            <span>
              {t("securityReview.finalUrl")}: {result.target.finalUrl}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-[24px] border border-black/6 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(29,78,216,0.94)_100%)] p-5 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={gradeBadgeClass(result.posture.grade)}>
                  {result.posture.grade}
                </Badge>
                <Badge className={riskBadgeClass(result.summary.riskLevel)}>
                  {t(`securityReview.riskLevels.${result.summary.riskLevel}`)}
                </Badge>
                <Badge>
                  {t(`securityReview.analysisModes.${result.posture.analysisMode}`)}
                </Badge>
                <span className="text-xs uppercase tracking-[0.18em] text-white/65">
                  {t("securityReview.score")}{" "}
                  {formatNumber(result.posture.securityScore)}/100
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold">
                {t("securityReview.executiveSummary")}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/82">
                {result.summary.headline}
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("securityReview.confirmedControls")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.strengths.length === 0 ? (
                      <p>{t("securityReview.noneRecorded")}</p>
                    ) : (
                      result.summary.strengths.map((entry) => <p key={entry}>{entry}</p>)
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("securityReview.topRisks")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.topRisks.length === 0 ? (
                      <p>{t("securityReview.noFindings")}</p>
                    ) : (
                      result.summary.topRisks.map((entry) => <p key={entry}>{entry}</p>)
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("securityReview.recommendedActions")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {result.summary.recommendedActions.length === 0 ? (
                      <p>{t("securityReview.noneRecorded")}</p>
                    ) : (
                      result.summary.recommendedActions.map((entry) => (
                        <p key={entry}>{entry}</p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                  {t("securityReview.targetScope")}
                </p>
                <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                  <p>
                    {t("securityReview.requestedUrl")}: {result.target.requestedUrl}
                  </p>
                  <p>
                    {t("securityReview.finalUrl")}: {result.target.finalUrl}
                  </p>
                  <p>
                    {t("securityReview.hostname")}: {result.target.hostname}
                  </p>
                  <p>
                    {t("securityReview.pagesScanned")}:{" "}
                    {formatNumber(result.target.pagesScanned)} /{" "}
                    {formatNumber(result.target.maxPages)}
                  </p>
                  <p>
                    {t("securityReview.analysisMode")}:{" "}
                    {t(`securityReview.analysisModes.${result.posture.analysisMode}`)}
                  </p>
                  {result.posture.browserEngine ? (
                    <p>
                      {t("securityReview.browserEngine")}: {result.posture.browserEngine}
                    </p>
                  ) : null}
                </div>
              </div>

              {result.warnings.length > 0 ? (
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                    {t("securityReview.reviewNotes")}
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
                {t("securityReview.score")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-2xl font-semibold text-[var(--text-primary)]">
                  {formatNumber(result.posture.securityScore)}
                </p>
                <Badge className={gradeBadgeClass(result.posture.grade)}>
                  {result.posture.grade}
                </Badge>
              </div>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("securityReview.pagesScanned")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(result.target.pagesScanned)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("securityReview.highFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-red-700">
                {formatNumber(findingCounts.high)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("securityReview.mediumFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-amber-700">
                {formatNumber(findingCounts.medium)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("securityReview.lowFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-sky-700">
                {formatNumber(findingCounts.low)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("securityReview.failChecks")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-red-700">
                {formatNumber(result.counts.fail)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.roadmap")}
              </h3>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[22px] border border-red-200 bg-red-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-900">
                  {t("securityReview.roadmapImmediate")}
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-red-800">
                  {result.summary.roadmap.immediate.length === 0 ? (
                    <p>{t("securityReview.noneRecorded")}</p>
                  ) : (
                    result.summary.roadmap.immediate.map((entry) => (
                      <p key={entry}>{entry}</p>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                  {t("securityReview.roadmapNext")}
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
                  {result.summary.roadmap.next.length === 0 ? (
                    <p>{t("securityReview.noneRecorded")}</p>
                  ) : (
                    result.summary.roadmap.next.map((entry) => <p key={entry}>{entry}</p>)
                  )}
                </div>
              </div>
              <div className="rounded-[22px] border border-sky-200 bg-sky-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-900">
                  {t("securityReview.roadmapHardening")}
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-sky-800">
                  {result.summary.roadmap.hardening.length === 0 ? (
                    <p>{t("securityReview.noneRecorded")}</p>
                  ) : (
                    result.summary.roadmap.hardening.map((entry) => (
                      <p key={entry}>{entry}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Radar className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.aiAnalyst")}
              </h3>
            </div>
            {result.aiAnalysis.status === "ready" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-[22px] border border-black/8 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{result.aiAnalysis.provider}</Badge>
                    <Badge>{result.aiAnalysis.model}</Badge>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                    {result.aiAnalysis.headline}
                  </h4>
                  <div className="mt-4 rounded-[18px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("securityReview.analystPerspective")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                      {result.aiAnalysis.analystPerspective}
                    </p>
                  </div>
                  <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                      {t("securityReview.decisiveVerdict")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      {result.aiAnalysis.decisiveVerdict}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[22px] border border-black/8 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("securityReview.aiDecisions")}
                    </p>
                    <div className="mt-3 space-y-3">
                      {result.aiAnalysis.decisions.map((decision) => (
                        <div
                          key={`${decision.priority}-${decision.title}`}
                          className="rounded-[18px] border border-black/8 bg-[var(--surface-soft)] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={priorityBadgeClass(decision.priority)}>
                              {t(`securityReview.priorities.${decision.priority}`)}
                            </Badge>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              {decision.title}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            {decision.rationale}
                          </p>
                          <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                            {decision.safeAction}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-black/8 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("securityReview.retestFocus")}
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {result.aiAnalysis.retestFocus.map((entry) => (
                        <p key={entry}>{entry}</p>
                      ))}
                    </div>
                    {result.aiAnalysis.constraints.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          {t("securityReview.aiConstraints")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {result.aiAnalysis.constraints.map((entry) => (
                            <Badge key={entry}>{entry}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">
                  {t("securityReview.aiUnavailable")}
                </p>
                <p className="mt-2 leading-6">
                  {result.aiAnalysis.unavailableReason ?? t("securityReview.aiUnavailableDescription")}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.attackPaths")}
              </h3>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {result.attackPaths.map((path) => (
                <div
                  key={path.id}
                  className={cn("rounded-[22px] border p-4", attackPathClass(path.status))}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {path.status === "blocked" ? (
                      <ShieldCheck className="size-4 text-emerald-700" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-700" />
                    )}
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{path.title}</p>
                    <Badge className={effortBadgeClass(path.attackerEffort)}>
                      {t(`securityReview.efforts.${path.attackerEffort}`)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    {t("securityReview.attackerGoal")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                    {path.attackerGoal}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {path.narrative}
                  </p>
                  {path.supportingCheckIds.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("securityReview.supportingSignals")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {path.supportingCheckIds
                          .map((id) => checkNamesById.get(id))
                          .filter((entry): entry is string => Boolean(entry))
                          .map((entry) => (
                            <Badge key={`${path.id}-${entry}`}>{entry}</Badge>
                          ))}
                      </div>
                    </div>
                  ) : null}
                  {path.blockers.length > 0 ? (
                    <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                      {path.blockers.map((entry) => (
                        <p key={entry}>{entry}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-[18px] border border-black/8 bg-white/70 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("securityReview.attackerExample")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                      {path.example}
                    </p>
                  </div>
                  <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">
                    {path.nextAction}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.findings")}
              </h3>
            </div>
            {result.findings.length === 0 ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                {t("securityReview.noFindings")}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {result.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-[22px] border border-black/8 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={findingSeverityClass(finding.severity)}>
                        {t(`securityReview.severities.${finding.severity}`)}
                      </Badge>
                      <Badge>{categoryLabel(finding.category, t)}</Badge>
                      <Badge className={priorityBadgeClass(finding.priority)}>
                        {t(`securityReview.priorities.${finding.priority}`)}
                      </Badge>
                      <Badge className={effortBadgeClass(finding.attackerEffort)}>
                        {t(`securityReview.efforts.${finding.attackerEffort}`)}
                      </Badge>
                      <Badge className={confidenceBadgeClass(finding.confidence)}>
                        {t(`securityReview.confidences.${finding.confidence}`)}
                      </Badge>
                    </div>
                    <h4 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                      {finding.title}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {finding.summary}
                    </p>
                    {finding.pageUrl ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        {t("securityReview.page")}: {finding.pageUrl}
                      </p>
                    ) : null}
                    <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                        {t("securityReview.impact")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-800">
                        {finding.impact}
                      </p>
                    </div>
                    <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-900">
                        {t("securityReview.attackerView")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-red-800">
                        {finding.attackerView}
                      </p>
                    </div>
                    {finding.attackerPrerequisites.length > 0 ? (
                      <div className="mt-4 rounded-[18px] border border-black/8 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          {t("securityReview.attackerPrerequisites")}
                        </p>
                        <div className="mt-2 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {finding.attackerPrerequisites.map((entry) => (
                            <p key={`${finding.id}-${entry}`}>{entry}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-[18px] border border-black/8 bg-[var(--surface-soft)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("securityReview.fixExample")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                        {finding.fixExample}
                      </p>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                      {t("securityReview.remediation")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {finding.remediation}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                      {t("securityReview.safeVerification")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {finding.safeVerification}
                    </p>
                    {finding.evidence.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {finding.evidence.map((entry) => (
                          <Badge key={`${finding.id}-${entry}`}>{entry}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.checks")}
              </h3>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {result.checks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-[22px] border border-black/8 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={checkStatusClass(check.status)}>
                      {t(`securityReview.statuses.${check.status}`)}
                    </Badge>
                    <Badge>{categoryLabel(check.category, t)}</Badge>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                    {check.name}
                  </h4>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {check.expectation}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]">
                    {check.observed}
                  </p>
                  {check.evidence.length > 0 ? (
                    <div className="mt-4 space-y-1 text-xs text-[var(--text-tertiary)]">
                      {check.evidence.map((entry) => (
                        <p key={entry}>{entry}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
