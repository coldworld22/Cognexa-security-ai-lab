"use client";

import { Eye, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AdminMobileScan } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface MobileScanHistoryProps {
  scans: AdminMobileScan[];
  loading: boolean;
  selectedScanId: string | null;
  onSelect: (scanId: string) => void;
  onDelete: (scan: AdminMobileScan) => void;
}

function scoreBadgeClass(score: number) {
  if (score >= 70) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (score >= 50) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

export function MobileScanHistory({
  scans,
  loading,
  selectedScanId,
  onSelect,
  onDelete
}: MobileScanHistoryProps) {
  const { formatDateTime, formatNumber, t } = useI18n();

  return (
    <Card className="space-y-4 bg-white/82">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-black/45">
          {t("mobileScanner.historyTitle")}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {t("mobileScanner.historyDescription")}
        </p>
      </div>

      {loading ? (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
          {t("mobileScanner.historyLoading")}
        </div>
      ) : scans.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
          {t("mobileScanner.historyEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map((scan) => (
            <div
              key={scan.id}
              className={cn(
                "rounded-[22px] border p-4 transition",
                scan.id === selectedScanId
                  ? "border-[#1a78cf]/25 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)]"
                  : "border-black/8 bg-[var(--surface-soft)]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    {scan.appName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {scan.packageName}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-black/45">
                    {formatDateTime(scan.scanDate)}
                  </p>
                </div>
                <Badge className={scoreBadgeClass(scan.securityScore)}>
                  {formatNumber(scan.securityScore)}/100
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(scan.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/80"
                >
                  <Eye className="size-4" />
                  {t("mobileScanner.viewDetails")}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(scan)}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  <Trash2 className="size-4" />
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
