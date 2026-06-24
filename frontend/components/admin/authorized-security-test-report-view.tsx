"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";

import {
  AuthorizedApiVulnerabilityType,
  AuthorizedSecurityAdaptationUrgency,
  AuthorizedSecurityFindingDisposition,
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunStatus
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function runStatusClass(status: AuthorizedSecurityTestRunStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "planned":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function riskBadgeClass(
  riskLevel: AuthorizedSecurityTestReport["summary"]["riskLevel"]
) {
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

function severityBadgeClass(severity: AuthorizedSecurityFindingSeverity) {
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

function validationBadgeClass(disposition: AuthorizedSecurityFindingDisposition) {
  switch (disposition) {
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function likelihoodBadgeClass(
  likelihood: AuthorizedSecurityTestReport["aiAnalysis"]["predictions"][number]["likelihood"]
) {
  switch (likelihood) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function sourceBadgeClass(source?: "ai" | "heuristic") {
  switch (source) {
    case "ai":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "heuristic":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function urgencyBadgeClass(urgency: AuthorizedSecurityAdaptationUrgency) {
  switch (urgency) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function attackPathClass(
  status: AuthorizedSecurityTestReport["attackPaths"][number]["status"]
) {
  switch (status) {
    case "exposed":
      return "border-red-200 bg-red-50/80";
    case "constrained":
      return "border-amber-200 bg-amber-50/80";
    default:
      return "border-emerald-200 bg-emerald-50/80";
  }
}

function moduleLabel(
  module: AuthorizedSecurityTestModule,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`authorizedTesting.modules.${module}`);
}

function apiVulnerabilityLabel(
  vulnerabilityType: AuthorizedApiVulnerabilityType,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`authorizedTesting.vulnerabilityTypes.${vulnerabilityType}`);
}

interface AuthorizedSecurityTestReportViewProps {
  report: AuthorizedSecurityTestReport;
}

export function AuthorizedSecurityTestReportView({
  report
}: AuthorizedSecurityTestReportViewProps) {
  const { formatDateTime, formatNumber, t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-black/45">
        <span>
          {t("authorizedTesting.executedAt")}: {formatDateTime(report.executedAt)}
        </span>
        <span>
          {t("authorizedTesting.targetLabel")}: {report.target.requestedUrl}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[24px] border border-black/6 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(29,78,216,0.94)_100%)] p-5 text-white">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={runStatusClass(report.status)}>
              {t(`authorizedTesting.runStatuses.${report.status}`)}
            </Badge>
            <Badge className={riskBadgeClass(report.summary.riskLevel)}>
              {t(`authorizedTesting.riskLevels.${report.summary.riskLevel}`)}
            </Badge>
            <Badge>
              {t(`authorizedTesting.planSources.${report.summary.planSource}`)}
            </Badge>
            <span className="text-xs uppercase tracking-[0.18em] text-white/65">
              {t("authorizedTesting.requestsSent")}:{" "}
              {formatNumber(report.summary.requestsSent)}/
              {formatNumber(report.summary.requestBudget)}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-semibold">
            {t("authorizedTesting.executiveSummary")}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/82">
            {report.summary.headline}
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                {t("authorizedTesting.modulesExecuted")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.summary.modulesExecuted.map((module) => (
                  <Badge key={module}>{moduleLabel(module, t)}</Badge>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                {t("authorizedTesting.recommendedActions")}
              </p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                {report.summary.recommendedActions.length === 0 ? (
                  <p>{t("authorizedTesting.noneRecorded")}</p>
                ) : (
                  report.summary.recommendedActions.map((action) => (
                    <p key={action}>{action}</p>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                {t("authorizedTesting.guardrails")}
              </p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                {report.guardrails.map((guardrail) => (
                  <p key={guardrail}>{guardrail}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("authorizedTesting.baseline")}
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  {t("authorizedTesting.score")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                  {formatNumber(report.baseline.securityScore)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  {t("authorizedTesting.pagesScanned")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                  {formatNumber(report.baseline.pagesScanned)}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-black/6 pt-4 text-sm leading-6 text-[var(--text-secondary)]">
              <p>{report.baseline.finalUrl}</p>
              <p>
                {t("authorizedTesting.verifiedHostname")}: {report.ownership.hostname}
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("authorizedTesting.aiAnalysis")}
              </p>
            </div>
            <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {report.aiAnalysis.status === "ready" ? (
                <>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {report.aiAnalysis.headline}
                  </p>
                  <p className="mt-2">{report.aiAnalysis.executiveSummary}</p>
                  <div className="mt-3 space-y-2">
                    {report.aiAnalysis.nextSteps.map((step) => (
                      <p key={step}>{step}</p>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.aiUnavailable")}
                  </p>
                  <p className="mt-2">
                    {report.aiAnalysis.unavailableReason ??
                      t("authorizedTesting.aiUnavailableDescription")}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("authorizedTesting.predictions")}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {report.aiAnalysis.predictions.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                  {t("authorizedTesting.noPredictions")}
                </div>
              ) : (
                report.aiAnalysis.predictions.map((prediction) => (
                  <div
                    key={prediction.id}
                    className="rounded-[20px] border border-black/6 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={likelihoodBadgeClass(prediction.likelihood)}>
                        {t(`authorizedTesting.likelihoods.${prediction.likelihood}`)}
                      </Badge>
                      <Badge>{moduleLabel(prediction.category, t)}</Badge>
                      <Badge className={sourceBadgeClass(prediction.source)}>
                        {t(`authorizedTesting.sources.${prediction.source}`)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {prediction.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {prediction.rationale}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.indicators")}
                    </p>
                    <div className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
                      {prediction.indicators.map((indicator) => (
                        <p key={indicator}>{indicator}</p>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.recommendedCheck")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {prediction.recommendedCheck}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {report.warnings.length > 0 ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-900" />
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                  {t("authorizedTesting.runNotes")}
                </p>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
                {report.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}

          {report.summary.executionInsights ||
          (report.summary.prioritizedModules?.length ?? 0) > 0 ? (
            <div className="space-y-4">
              {report.summary.executionInsights ? (
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.executionInsights")}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.parallelism")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.moduleConcurrency)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.cacheHits")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.probeCacheHits)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.cacheMisses")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.probeCacheMisses)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.rateLimits")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.rateLimitedResponses)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.backoffEvents")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.adaptiveBackoffCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.networkRequests")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.networkRequestsSent)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {(report.summary.prioritizedModules?.length ?? 0) > 0 ? (
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.prioritizedModules")}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {report.summary.prioritizedModules?.map((priority) => (
                      <div
                        key={priority.module}
                        className="rounded-[18px] border border-black/6 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{moduleLabel(priority.module, t)}</Badge>
                          <Badge>
                            {t("authorizedTesting.priorityScore", {
                              score: formatNumber(priority.score)
                            })}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {priority.reasons.map((reason) => (
                            <p key={reason}>{reason}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {report.summary.campaignStory ||
      (report.summary.adaptation?.decisions.length ?? 0) > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {report.summary.campaignStory ? (
            <div
              className={cn(
                "rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4",
                (report.summary.adaptation?.decisions.length ?? 0) === 0 &&
                  "xl:col-span-2"
              )}
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Campaign story
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {report.summary.campaignStory.narrative}
              </p>
              {report.summary.campaignStory.chainHighlights.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {report.summary.campaignStory.chainHighlights.map((highlight) => (
                    <Badge key={highlight}>{highlight}</Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {report.summary.campaignStory.sections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-[18px] border border-black/6 bg-white p-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                      {section.title}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {section.narrative}
                    </p>
                    <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                      {section.evidence.map((evidence) => (
                        <p key={evidence}>{evidence}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(report.summary.adaptation?.decisions.length ?? 0) > 0 ? (
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <RefreshCcw className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Adaptive follow-up
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                The run added safe follow-up coverage after intermediate evidence
                changed the next best attack path under the current budget.
              </p>
              <div className="mt-4 space-y-3">
                {report.summary.adaptation?.decisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="rounded-[18px] border border-black/6 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{moduleLabel(decision.module, t)}</Badge>
                      <Badge className={urgencyBadgeClass(decision.urgency)}>
                        {decision.urgency}
                      </Badge>
                      <Badge className={sourceBadgeClass(decision.source)}>
                        {decision.source}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {decision.rationale}
                    </p>
                    {decision.triggerCategories.length > 0 ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Triggered by{" "}
                        {decision.triggerCategories
                          .map((category) => moduleLabel(category, t))
                          .join(" + ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.plan")}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {report.plan.map((step) => (
              <div
                key={step.id}
                className="rounded-[20px] border border-black/6 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{moduleLabel(step.category, t)}</Badge>
                </div>
                <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {step.objective}
                </p>
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.safeMethod")}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {step.safeMethod}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.attackPaths")}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {report.attackPaths.map((attackPath) => (
              <div
                key={attackPath.id}
                className={cn(
                  "rounded-[20px] border p-4",
                  attackPathClass(attackPath.status)
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t(`authorizedTesting.pathStatuses.${attackPath.status}`)}</Badge>
                  <Badge>
                    {t(`authorizedTesting.priorities.${attackPath.remediationPriority}`)}
                  </Badge>
                  {attackPath.source ? (
                    <Badge className={sourceBadgeClass(attackPath.source)}>
                      {t(`authorizedTesting.sources.${attackPath.source}`)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                  {attackPath.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {attackPath.narrative}
                </p>
                {typeof attackPath.confidence === "number" ? (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    {t("authorizedTesting.confidence")}:{" "}
                    {formatNumber(attackPath.confidence)}%
                  </p>
                ) : null}
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.safeValidation")}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {attackPath.safeValidation}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.findings")}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {report.findings.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                {t("authorizedTesting.noFindings")}
              </div>
            ) : (
              report.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-[20px] border border-black/6 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={severityBadgeClass(finding.severity)}>
                      {t(`authorizedTesting.severities.${finding.severity}`)}
                    </Badge>
                    <Badge>{moduleLabel(finding.category, t)}</Badge>
                    {finding.validation ? (
                      <>
                        <Badge
                          className={validationBadgeClass(
                            finding.validation.disposition
                          )}
                        >
                          {t(
                            `authorizedTesting.validationStatuses.${finding.validation.disposition}`
                          )}
                        </Badge>
                        <Badge className={sourceBadgeClass(finding.validation.source)}>
                          {t(`authorizedTesting.sources.${finding.validation.source}`)}
                        </Badge>
                      </>
                    ) : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                    {finding.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {finding.summary}
                  </p>
                  {finding.apiDetails ? (
                    <div className="mt-3 rounded-2xl border border-black/6 bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {t("authorizedTesting.apiSignal")}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.vulnerabilityType")}
                        </span>
                        :{" "}
                        {apiVulnerabilityLabel(
                          finding.apiDetails.vulnerabilityType,
                          t
                        )}
                      </p>
                      <p>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.endpoint")}
                        </span>
                        : {finding.apiDetails.endpoint}
                      </p>
                      <p>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.httpMethod")}
                        </span>
                        : {finding.apiDetails.method}
                      </p>
                      <p>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.signalConfidence")}
                        </span>
                        : {formatNumber(finding.apiDetails.confidence)}%
                      </p>
                      <p className="mt-2 font-semibold text-[var(--text-primary)]">
                        {t("authorizedTesting.safePoc")}
                      </p>
                      <p className="mt-1 leading-6 text-[var(--text-secondary)]">
                        {finding.apiDetails.poc}
                      </p>
                    </div>
                  ) : null}
                  {finding.validation ? (
                    <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                      <p>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.confidence")}
                        </span>
                        : {formatNumber(finding.validation.confidence)}%
                      </p>
                      <p>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.validationRationale")}
                        </span>
                        : {finding.validation.rationale}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.remediation")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {finding.remediation}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.safeRetest")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {finding.safeRetest}
                  </p>
                  <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                    {finding.evidence.map((evidence) => (
                      <p key={evidence}>{evidence}</p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.timeline")}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {report.events.map((event) => (
              <div
                key={event.id}
                className="rounded-[20px] border border-black/6 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={severityBadgeClass(event.severity)}>
                    {t(`authorizedTesting.severities.${event.severity}`)}
                  </Badge>
                  <Badge>{t(`authorizedTesting.eventTypes.${event.eventType}`)}</Badge>
                  {event.category ? <Badge>{moduleLabel(event.category, t)}</Badge> : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  {event.message}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {formatDateTime(event.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
