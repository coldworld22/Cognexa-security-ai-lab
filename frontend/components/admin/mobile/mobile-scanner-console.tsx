"use client";

import Link from "next/link";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  FileArchive,
  FileUp,
  RefreshCcw,
  ShieldCheck,
  Smartphone
} from "lucide-react";

import {
  deleteMobileScan,
  getMobileScan,
  getPrivateModeSession,
  listMobileScans,
  scanMobileApplication
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdminMobileScan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MobileScanHelp } from "@/components/admin/mobile/mobile-scan-help";
import { MobileScanHistory } from "@/components/admin/mobile/mobile-scan-history";
import {
  MobileScanProgress,
  MobileScanSpinner
} from "@/components/admin/mobile/mobile-scan-loading";
import { MobileScanResults } from "@/components/admin/mobile/mobile-scan-results";
import { Card } from "@/components/ui/card";

const ACCEPTED_EXTENSIONS = new Set(["apk", "aab", "ipa"]);
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function getFileExtension(fileName: string) {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
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

export function MobileScannerConsole() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<AdminMobileScan[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<AdminMobileScan | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [privateModeActive, setPrivateModeActive] = useState<boolean | null>(null);
  const [privateModeReady, setPrivateModeReady] = useState<boolean | null>(null);
  const [privateModeVerificationError, setPrivateModeVerificationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    void Promise.all([loadPrivateModeState(), loadHistory()]);
  }, []);

  const privateModeBlockedMessage =
    privateModeActive === true
      ? t("privateMode.verifiedRequiredForSecurityModules")
      : t("privateMode.requiredForSecurityModules");
  const privateModeActionMessage =
    privateModeActive === true
      ? t("privateMode.verifyBeforeSecurityTools")
      : t("privateMode.activateBeforeSecurityTools");

  const fileExtension = useMemo(
    () => (selectedFile ? getFileExtension(selectedFile.name) : ""),
    [selectedFile]
  );

  async function loadPrivateModeState() {
    try {
      const state = await getPrivateModeSession();
      setPrivateModeActive(Boolean(state.session));
      setPrivateModeReady(state.routeVerified);
      setPrivateModeVerificationError(state.verificationError);
    } catch {
      setPrivateModeActive(false);
      setPrivateModeReady(false);
      setPrivateModeVerificationError(null);
    }
  }

  async function loadHistory(preferredScanId?: string | null) {
    setHistoryLoading(true);

    try {
      const scans = await listMobileScans(30);
      setHistory(scans);

      const fallbackSelection = preferredScanId ?? selectedScanId ?? scans[0]?.id ?? null;
      const fallbackScan = scans.find((scan) => scan.id === fallbackSelection) ?? scans[0] ?? null;

      setSelectedScanId(fallbackScan?.id ?? null);
      setSelectedScan(fallbackScan);
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : t("mobileScanner.historyLoadFailed")
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function updateSelectedFile(file: File | null) {
    if (!file) {
      return;
    }

    const extension = getFileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      setError(t("mobileScanner.fileTypeInvalid"));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t("mobileScanner.fileTooLarge"));
      return;
    }

    setSelectedFile(file);
    setError(null);
    setNotice(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    updateSelectedFile(file);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    updateSelectedFile(file);
  }

  async function handleScan() {
    if (privateModeReady !== true) {
      setError(privateModeBlockedMessage);
      return;
    }

    if (!selectedFile) {
      setError(t("mobileScanner.fileRequired"));
      return;
    }

    setIsScanning(true);
    setProgress(8);
    setError(null);
    setNotice(null);

    const activeTimer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 94) {
          return current;
        }

        if (current < 28) {
          return current + 7;
        }

        if (current < 60) {
          return current + 5;
        }

        if (current < 84) {
          return current + 3;
        }

        return current + 1;
      });
    }, 1_200);

    try {
      const scan = await scanMobileApplication(selectedFile);
      window.clearInterval(activeTimer);
      setProgress(100);
      setSelectedFile(null);
      setSelectedScan(scan);
      setSelectedScanId(scan.id);
      setNotice(t("mobileScanner.scanCompleted"));
      await loadHistory(scan.id);
    } catch (scanError) {
      window.clearInterval(activeTimer);
      setProgress(0);
      setError(
        scanError instanceof Error ? scanError.message : t("mobileScanner.scanFailed")
      );
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSelect(scanId: string) {
    setIsSelecting(true);
    setError(null);

    try {
      const scan = await getMobileScan(scanId);
      setSelectedScan(scan);
      setSelectedScanId(scan.id);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : null);
    } finally {
      setIsSelecting(false);
    }
  }

  async function handleDelete(scan: AdminMobileScan) {
    const confirmed = window.confirm(
      t("mobileScanner.deleteConfirm", {
        appName: scan.appName
      })
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await deleteMobileScan(scan.id);
      const nextScanId =
        selectedScanId === scan.id
          ? history.find((entry) => entry.id !== scan.id)?.id ?? null
          : selectedScanId;
      setNotice(t("mobileScanner.deleted"));
      await loadHistory(nextScanId);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("mobileScanner.deleteFailed")
      );
    }
  }

  return (
    <Card className="space-y-5 bg-white/82">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">
            {t("mobileScanner.label")}
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">
            {t("mobileScanner.title")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {t("mobileScanner.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 lg:max-w-md">
          <p className="font-semibold">{t("mobileScanner.policyTitle")}</p>
          <p className="mt-2 leading-6 text-emerald-800">
            {t("mobileScanner.policyDescription")}
          </p>
        </div>
      </div>

      {privateModeReady === false ? (
        <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p className="font-semibold text-red-900">{privateModeBlockedMessage}</p>
          <p className="mt-2 leading-6">
            {privateModeActionMessage}{" "}
            <Link href="/admin/private-mode" className="font-semibold underline">
              {t("privateMode.openConsole")}
            </Link>
          </p>
          {privateModeVerificationError ? (
            <p className="mt-2 leading-6 text-red-700">{privateModeVerificationError}</p>
          ) : null}
        </div>
      ) : null}

      <MobileScanHelp />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 bg-white/88">
            <div className="flex items-center gap-2">
              <FileUp className="size-4 text-[var(--brand-blue)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("mobileScanner.uploadLabel")}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {t("mobileScanner.uploadHint")}
                </p>
              </div>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "cursor-pointer rounded-[28px] border-2 border-dashed p-8 text-center transition",
                dragActive
                  ? "border-[#1a78cf]/45 bg-[rgba(21,167,243,0.08)]"
                  : "border-black/10 bg-[var(--surface-soft)] hover:border-[#1a78cf]/25 hover:bg-white"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk,.aab,.ipa"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="inline-flex rounded-2xl bg-[rgba(21,167,243,0.12)] p-4 text-[var(--brand-blue)]">
                <Smartphone className="size-6" />
              </div>
              <p className="mt-4 text-base font-semibold text-[var(--text-primary)]">
                {dragActive ? t("mobileScanner.uploadActive") : t("mobileScanner.uploadHint")}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                APK, AAB, IPA • {formatBytes(MAX_FILE_SIZE_BYTES)} max
              </p>
            </div>

            {selectedFile ? (
              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-[var(--brand-blue)]">
                      <FileArchive className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {selectedFile.name}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {formatBytes(selectedFile.size)} • {fileExtension.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    {t("mobileScanner.fileReady")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                {t("mobileScanner.uploadEmpty")}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleScan();
                }}
                disabled={isScanning || privateModeReady !== true}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <RefreshCcw
                  className={cn("size-4", isScanning && "animate-spin")}
                />
                {isScanning ? t("mobileScanner.scanning") : t("mobileScanner.scan")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
              >
                <FileUp className="size-4" />
                {t("mobileScanner.chooseAnother")}
              </button>
              {privateModeReady === true ? (
                <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
                  <ShieldCheck className="size-4" />
                  <span>{t("privateMode.readyNotice")}</span>
                </div>
              ) : null}
            </div>

            {isScanning || progress > 0 ? (
              <MobileScanProgress progress={progress} />
            ) : null}

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("mobileScanner.boundaryTitle")}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {t("mobileScanner.boundaryDescription")}
              </p>
            </div>
          </Card>

          {error ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}
        </div>

        <MobileScanHistory
          scans={history}
          loading={historyLoading}
          selectedScanId={selectedScanId}
          onSelect={(scanId) => {
            void handleSelect(scanId);
          }}
          onDelete={(scan) => {
            void handleDelete(scan);
          }}
        />
      </div>

      {!selectedScan ? (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
          {isSelecting ? <MobileScanSpinner /> : t("mobileScanner.resultEmpty")}
        </div>
      ) : (
        <MobileScanResults result={selectedScan} />
      )}
    </Card>
  );
}
