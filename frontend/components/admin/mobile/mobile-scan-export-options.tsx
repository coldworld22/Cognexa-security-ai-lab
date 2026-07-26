"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { exportMobileScan } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface MobileScanExportOptionsProps {
  scanId: string;
}

export function MobileScanExportOptions({
  scanId
}: MobileScanExportOptionsProps) {
  const { t } = useI18n();
  const [exportingFormat, setExportingFormat] = useState<"json" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "json" | "pdf") {
    setExportingFormat(format);
    setError(null);

    try {
      const blob = await exportMobileScan(scanId, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mobile-scan-${scanId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : t("mobileScanner.exportFailed")
      );
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void handleExport("pdf");
          }}
          disabled={exportingFormat !== null}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="size-4" />
          {exportingFormat === "pdf" ? t("mobileScanner.exporting") : t("mobileScanner.exportPdf")}
        </button>

        <button
          type="button"
          onClick={() => {
            void handleExport("json");
          }}
          disabled={exportingFormat !== null}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="size-4" />
          {exportingFormat === "json"
            ? t("mobileScanner.exporting")
            : t("mobileScanner.exportJson")}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
