"use client";

import { ShieldAlert, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";

import { MobileScanExportOptions } from "@/components/admin/mobile/mobile-scan-export-options";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import {
  AdminMobileScan,
  AdminMobileScanPermission,
  AdminMobileScanVulnerability
} from "@/lib/types";

interface MobileScanResultsProps {
  result: AdminMobileScan;
}

function formatBytes(value: number) {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const normalized = value / 1024 ** index;
  return `${normalized.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function scoreTone(score: number) {
  if (score >= 70) {
    return {
      ring: "from-emerald-500 to-emerald-700",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      labelKey: "mobileScanner.scoreGood"
    };
  }

  if (score >= 50) {
    return {
      ring: "from-amber-500 to-amber-700",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      labelKey: "mobileScanner.scoreNeedsWork"
    };
  }

  return {
    ring: "from-red-500 to-red-700",
    badge: "border-red-200 bg-red-50 text-red-700",
    labelKey: "mobileScanner.scoreCritical"
  };
}

function severityBadgeClass(severity: AdminMobileScanVulnerability["severity"]) {
  switch (severity) {
    case "critical":
      return "border-red-300 bg-red-100 text-red-800";
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

function permissionBadgeClass(risk: AdminMobileScanPermission["risk"]) {
  switch (risk) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export function MobileScanResults({ result }: MobileScanResultsProps) {
  const { formatDateTime, formatNumber, t } = useI18n();
  const tone = scoreTone(result.securityScore);

  return (
    <div className="space-y-5">
      <Card className="space-y-5 bg-white/82">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("mobileScanner.summary")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{result.appName}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {result.summary.headline}
            </p>
          </div>
          <MobileScanExportOptions scanId={result.id} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <div className="mx-auto flex size-36 items-center justify-center rounded-full bg-[var(--surface)]">
              <div
                className={`flex size-28 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--surface)_0%,white_100%)] ring-8 ring-offset-4 ring-offset-[var(--surface-soft)] ${tone.ring === "from-emerald-500 to-emerald-700" ? "ring-emerald-500/80" : tone.ring === "from-amber-500 to-amber-700" ? "ring-amber-500/80" : "ring-red-500/80"}`}
              >
                <div className="text-center">
                  <p className="text-3xl font-semibold text-[var(--text-primary)]">
                    {formatNumber(result.securityScore)}
                  </p>
                  <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                    / 100
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 text-center">
              <Badge className={tone.badge}>{t(tone.labelKey)}</Badge>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("mobileScanner.totalFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(result.summary.totalVulnerabilities)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("mobileScanner.riskLevel")}
              </p>
              <p className="mt-3 text-2xl font-semibold capitalize text-[var(--text-primary)]">
                {result.summary.riskLevel}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("mobileScanner.riskyPermissions")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(result.summary.riskyPermissions)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("mobileScanner.detectedTrackers")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(result.summary.trackerCount)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="space-y-4 bg-white/82">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
              {t("mobileScanner.appInfo")}
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.packageName")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {result.packageName}
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.version")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {result.version}
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.targetSdk")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {result.targetSdk || "n/a"}
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.minSdk")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {result.minSdk || "n/a"}
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.fileSize")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {formatBytes(result.fileSize)}
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t("mobileScanner.scanDate")}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {formatDateTime(result.scanDate)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 bg-white/82">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
              {t("mobileScanner.recommendations")}
            </h3>
          </div>
          {result.recommendations.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {t("mobileScanner.recommendationsEmpty")}
            </p>
          ) : (
            <div className="space-y-3">
              {result.recommendations.map((recommendation) => (
                <div
                  key={recommendation}
                  className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]"
                >
                  {recommendation}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="space-y-4 bg-white/82">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
              {t("mobileScanner.vulnerabilities")}
            </h3>
          </div>
          {result.vulnerabilities.length === 0 ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              {t("mobileScanner.noVulnerabilities")}
            </div>
          ) : (
            <div className="space-y-3">
              {result.vulnerabilities.map((vulnerability) => (
                <div
                  key={vulnerability.id}
                  className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={severityBadgeClass(vulnerability.severity)}>
                      {t(`mobileScanner.severities.${vulnerability.severity}`)}
                    </Badge>
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {vulnerability.title}
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {vulnerability.description}
                  </p>
                  <div className="mt-3 text-sm text-[var(--text-secondary)]">
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">
                        File:
                      </span>{" "}
                      {vulnerability.file}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">
                        Line:
                      </span>{" "}
                      {vulnerability.line || "n/a"}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {t("mobileScanner.remediation")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {vulnerability.remediation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4 bg-white/82">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("mobileScanner.permissions")}
              </h3>
            </div>
            {result.permissions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                {t("mobileScanner.noPermissions")}
              </p>
            ) : (
              <div className="space-y-3">
                {result.permissions.map((permission) => (
                  <div
                    key={permission.name}
                    className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={permissionBadgeClass(permission.risk)}>
                        {t(`mobileScanner.permissionsRisk.${permission.risk}`)}
                      </Badge>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {permission.name}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {permission.reason || permission.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 bg-white/82">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                {t("mobileScanner.trackers")}
              </h3>
            </div>
            {result.trackers.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                {t("mobileScanner.trackersNone")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {result.trackers.map((tracker) => (
                  <Badge key={tracker}>{tracker}</Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
