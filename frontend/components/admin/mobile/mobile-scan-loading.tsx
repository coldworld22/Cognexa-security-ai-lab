"use client";

import { LoaderCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getStageLabel(progress: number) {
  if (progress < 30) {
    return "mobileScanner.progressUploading";
  }

  if (progress < 75) {
    return "mobileScanner.progressAnalyzing";
  }

  if (progress < 95) {
    return "mobileScanner.progressReporting";
  }

  return "mobileScanner.progressFinalizing";
}

export function MobileScanSpinner({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <div className={cn("flex items-center gap-3 text-sm text-[var(--text-secondary)]", className)}>
      <LoaderCircle className="size-4 animate-spin text-[var(--brand-blue)]" />
      <span>{t("mobileScanner.scanning")}</span>
    </div>
  );
}

export function MobileScanProgress({ progress }: { progress: number }) {
  const { formatNumber, t } = useI18n();
  const normalizedProgress = clampProgress(progress);

  return (
    <div className="space-y-3 rounded-[24px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
      <div className="flex items-center justify-between gap-3">
        <MobileScanSpinner />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {formatNumber(normalizedProgress)}%
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/80">
        <div
          className="h-full rounded-full bg-[linear-gradient(135deg,#059669_0%,#1d4ed8_100%)] transition-[width] duration-700"
          style={{ width: `${normalizedProgress}%` }}
        />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {t(getStageLabel(normalizedProgress))}
      </p>
    </div>
  );
}
