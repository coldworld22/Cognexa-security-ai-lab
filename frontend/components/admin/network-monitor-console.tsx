"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ExternalLink,
  Eye,
  LaptopMinimal,
  MonitorSmartphone,
  RefreshCw,
  Router,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Wifi
} from "lucide-react";

import {
  createAdminNetworkWebSocketUrl,
  getAdminNetworkSnapshot,
  resolveAdminNetworkNames,
  startAdminNetworkScan
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  AdminNetworkEndpoint,
  AdminNetworkEvent,
  AdminNetworkJob,
  AdminNetworkScan
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

function statusBadgeClass(status: AdminNetworkEndpoint["status"]) {
  switch (status) {
    case "online":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function resolutionSourceLabel(
  source: AdminNetworkEndpoint["resolutionSource"],
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`adminNetwork.resolutionSources.${source}`);
}

function isPlaceholderRemoteAccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "example.com" ||
      parsed.hostname === "www.example.com" ||
      parsed.hostname === "iana.org" ||
      parsed.hostname.endsWith(".example")
    );
  } catch {
    return true;
  }
}

export function NetworkMonitorConsole() {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [scan, setScan] = useState<AdminNetworkScan | null>(null);
  const [observedEndpoints, setObservedEndpoints] = useState<AdminNetworkEndpoint[]>([]);
  const [currentJob, setCurrentJob] = useState<AdminNetworkJob | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminNetworkEndpoint["status"]>("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | AdminNetworkEndpoint["resolutionSource"]
  >("all");
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequestingScan, setIsRequestingScan] = useState(false);
  const [remoteEndpoint, setRemoteEndpoint] = useState<AdminNetworkEndpoint | null>(null);

  async function loadSnapshot() {
    setIsLoading(true);
    setError(null);

    try {
      const snapshot = await getAdminNetworkSnapshot();
      setScan(snapshot);
      setObservedEndpoints(snapshot.endpoints);
      setCurrentJob(snapshot.currentJob);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : t("adminNetwork.scanFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function queueJob(mode: "scan" | "resolve_names") {
    setIsRequestingScan(true);
    setError(null);

    try {
      const job =
        mode === "scan"
          ? await startAdminNetworkScan()
          : await resolveAdminNetworkNames();
      setCurrentJob(job);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : t("adminNetwork.scanFailed"));
    } finally {
      setIsRequestingScan(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      try {
        socket = new WebSocket(createAdminNetworkWebSocketUrl());
      } catch (socketError) {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
          setError(
            socketError instanceof Error
              ? socketError.message
              : t("adminNetwork.liveUpdatesFailed")
          );
        }
        return;
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as AdminNetworkEvent;

          if (payload.type === "snapshot" && payload.snapshot) {
            setScan(payload.snapshot);
            setObservedEndpoints(payload.snapshot.endpoints);
            setCurrentJob(payload.snapshot.currentJob);
            setError(null);
            return;
          }

          if (payload.type === "job") {
            setCurrentJob(payload.job ?? null);
            if (payload.job?.state === "failed") {
              setError(payload.job.error ?? t("adminNetwork.scanFailed"));
            }
          }
        } catch {
          setError(t("adminNetwork.liveUpdatesFailed"));
        }
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }

        reconnectTimer = window.setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        setError(t("adminNetwork.liveUpdatesFailed"));
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [t]);

  useEffect(() => {
    if (!liveRefresh) {
      return;
    }

    const trigger = () => {
      if (currentJob?.state === "queued" || currentJob?.state === "running") {
        return;
      }

      void queueJob("scan");
    };

    const timer = window.setInterval(trigger, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentJob?.state, liveRefresh]);

  useEffect(() => {
    if (!liveRefresh || isLoading || currentJob) {
      return;
    }

    void queueJob("scan");
  }, [currentJob, isLoading, liveRefresh]);

  const filteredEndpoints = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return observedEndpoints.filter((endpoint) => {
      if (statusFilter !== "all" && endpoint.status !== statusFilter) {
        return false;
      }

      if (sourceFilter !== "all" && endpoint.resolutionSource !== sourceFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        endpoint.displayName,
        endpoint.hostname,
        endpoint.ipAddress,
        endpoint.subnet,
        endpoint.interfaceAddress,
        endpoint.macAddress ?? "",
        endpoint.vendor ?? "",
        endpoint.operatingSystem
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [observedEndpoints, searchTerm, sourceFilter, statusFilter]);

  const onlineCount = observedEndpoints.filter((endpoint) => endpoint.status === "online").length;
  const offlineCount = observedEndpoints.filter((endpoint) => endpoint.status === "offline").length;

  function openRemoteAccess(endpoint: AdminNetworkEndpoint) {
    if (!endpoint.remoteAccess) {
      return;
    }

    if (isPlaceholderRemoteAccessUrl(endpoint.remoteAccess.launchUrl)) {
      setError(t("adminNetwork.remotePlaceholder"));
      return;
    }

    if (endpoint.remoteAccess.mode === "external") {
      window.open(endpoint.remoteAccess.launchUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setRemoteEndpoint(endpoint);
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5 bg-white/82">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("adminNetwork.label")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">
              {t("adminNetwork.title")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {t("adminNetwork.description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={liveRefresh}
                onChange={(event) => setLiveRefresh(event.target.checked)}
              />
              {t("adminNetwork.liveRefresh")}
            </label>
            <button
              type="button"
              onClick={() => {
                void queueJob("resolve_names");
              }}
              disabled={isLoading || isRequestingScan || currentJob?.state === "running"}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Tags className="size-4" />
              {t("adminNetwork.resolveNames")}
            </button>
            <button
              type="button"
              onClick={() => {
                void queueJob("scan");
              }}
              disabled={isLoading || isRequestingScan || currentJob?.state === "running"}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  (isRequestingScan || currentJob?.state === "running") && "animate-spin"
                )}
              />
              {t("adminNetwork.scanNow")}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("adminNetwork.observedHosts")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(observedEndpoints.length)}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("adminNetwork.onlineHosts")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(onlineCount)}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("adminNetwork.offlineHosts")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(offlineCount)}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("adminNetwork.subnetsScanned")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(scan?.subnets.length ?? 0)}
            </p>
          </div>
        </div>

        {currentJob ? (
          <div className="rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {currentJob.kind === "resolve_names"
                    ? t("adminNetwork.resolveJobTitle")
                    : t("adminNetwork.scanJobTitle")}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {t(`common.status.${currentJob.state}`)} ·{" "}
                  {formatNumber(currentJob.scannedTargets)} /{" "}
                  {formatNumber(currentJob.totalTargets)} ·{" "}
                  {formatNumber(currentJob.discoveredHosts)} {t("adminNetwork.hostsFound")}
                </p>
                {currentJob.error ? (
                  <p className="mt-2 text-sm text-red-700">{currentJob.error}</p>
                ) : null}
              </div>
              <div className="min-w-[220px] flex-1 rounded-full border border-black/8 bg-white/80 p-1">
                <div
                  className="h-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] transition-all"
                  style={{
                    width: `${
                      currentJob.totalTargets > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (currentJob.scannedTargets / currentJob.totalTargets) * 100
                            )
                          )
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("adminNetwork.visibilityTitle")}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {t("adminNetwork.visibilityDescription")}
            </p>
          </div>
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="size-4" />
              <p className="text-sm font-semibold">
                {t("adminNetwork.runtimeNoteTitle")}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              {t("adminNetwork.runtimeNote")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t("adminNetwork.searchPlaceholder")}
              className="w-full rounded-[22px] border border-black/10 bg-white/84 py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | AdminNetworkEndpoint["status"])
              }
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="all">{t("adminNetwork.allStatuses")}</option>
              <option value="online">{t("common.status.online")}</option>
              <option value="degraded">{t("common.status.degraded")}</option>
              <option value="offline">{t("common.status.offline")}</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(
                  event.target.value as "all" | AdminNetworkEndpoint["resolutionSource"]
                )
              }
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="all">{t("adminNetwork.allSources")}</option>
              <option value="dns">{t("adminNetwork.resolutionSources.dns")}</option>
              <option value="netbios">{t("adminNetwork.resolutionSources.netbios")}</option>
              <option value="smb">{t("adminNetwork.resolutionSources.smb")}</option>
              <option value="mdns">{t("adminNetwork.resolutionSources.mdns")}</option>
              <option value="fortigate">{t("adminNetwork.resolutionSources.fortigate")}</option>
              <option value="agent">{t("adminNetwork.resolutionSources.agent")}</option>
              <option value="unresolved">{t("adminNetwork.resolutionSources.unresolved")}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-black/45">
          <span>
            {t("adminNetwork.lastScanned", {
              value: scan?.scannedAt ? formatDateTime(scan.scannedAt) : t("common.unavailable")
            })}
          </span>
        </div>

        {scan ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <Router className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("adminNetwork.scannedSubnets")}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {scan.subnets.map((subnet) => (
                  <Badge key={subnet}>{subnet}</Badge>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <Wifi className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("adminNetwork.interfaces")}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {scan.interfaceAddresses.map((address) => (
                  <Badge key={address}>{address}</Badge>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-5">
                <div className="h-4 w-32 animate-pulse rounded-full bg-black/10" />
                <div className="mt-4 h-4 w-44 animate-pulse rounded-full bg-black/10" />
                <div className="mt-6 h-16 animate-pulse rounded-[18px] bg-black/10" />
              </div>
            ))}
          </div>
        ) : filteredEndpoints.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
            {observedEndpoints.length === 0
              ? t("adminNetwork.noHosts")
              : t("adminNetwork.emptySearch")}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredEndpoints.map((endpoint) => (
              <div
                key={endpoint.id}
                className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {endpoint.displayName}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {endpoint.hostname !== endpoint.ipAddress
                        ? endpoint.hostname
                        : endpoint.ipAddress}
                    </p>
                  </div>
                  <Badge className={statusBadgeClass(endpoint.status)}>
                    {t(`common.status.${endpoint.status}`)}
                  </Badge>
                </div>

                {endpoint.remoteAccess ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openRemoteAccess(endpoint)}
                      disabled={isPlaceholderRemoteAccessUrl(endpoint.remoteAccess.launchUrl)}
                      className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      <MonitorSmartphone className="size-4" />
                      {endpoint.remoteAccess.label}
                    </button>
                    {endpoint.remoteAccess.mode === "external" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-[var(--text-secondary)]">
                        <ExternalLink className="size-3.5" />
                        {t("adminNetwork.remoteExternal")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-[var(--text-secondary)]">
                        <MonitorSmartphone className="size-3.5" />
                        {t("adminNetwork.remoteEmbedded")}
                      </span>
                    )}
                  </div>
                ) : null}

                {endpoint.agentInstalled && !endpoint.remoteAccess ? (
                  <div className="mt-4 rounded-[18px] border border-dashed border-black/10 bg-white/72 px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {t("adminNetwork.remoteNotConfigured")}
                  </div>
                ) : null}

                {endpoint.remoteAccess &&
                isPlaceholderRemoteAccessUrl(endpoint.remoteAccess.launchUrl) ? (
                  <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {t("adminNetwork.remotePlaceholder")}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.ipAddress")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.ipAddress}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.hostname")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.hostname}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.macAddress")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.macAddress ?? t("common.unavailable")}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.vendor")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.vendor ?? t("common.unavailable")}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.loggedInUser")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.loggedInUser ?? t("common.unavailable")}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.interfaceAddress")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.interfaceAddress}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.source")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {resolutionSourceLabel(endpoint.resolutionSource, t)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.latency")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {typeof endpoint.telemetry.latencyMs === "number"
                        ? `${formatNumber(endpoint.telemetry.latencyMs)} ms`
                        : t("common.unavailable")}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.firstSeen")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatDateTime(endpoint.firstSeenAt)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.lastSeen")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatDateTime(endpoint.lastSeenAt)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/82 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("adminNetwork.visibility")}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      {endpoint.agentInstalled ? (
                        <ShieldCheck className="size-4 text-emerald-600" />
                      ) : (
                        <LaptopMinimal className="size-4 text-[var(--text-secondary)]" />
                      )}
                      {t(`adminNetwork.activityLevels.${endpoint.activityLevel}`)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Activity className="size-4 text-[var(--brand-blue)]" />
                  <span>
                    {endpoint.operatingSystem && endpoint.operatingSystem !== "Unknown"
                      ? endpoint.operatingSystem
                      : t("adminNetwork.osUnknown")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {remoteEndpoint?.remoteAccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="flex h-[min(88vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#08111f] shadow-[0_36px_120px_rgba(2,6,23,0.55)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
              <div>
                <p className="text-sm font-semibold">
                  {remoteEndpoint.displayName}
                </p>
                <p className="mt-1 text-xs text-white/65">
                  {remoteEndpoint.hostname} / {remoteEndpoint.ipAddress}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.open(remoteEndpoint.remoteAccess!.launchUrl, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                >
                  <ExternalLink className="size-4" />
                  {t("adminNetwork.openInNewTab")}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoteEndpoint(null)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
            <div className="flex-1 bg-[#030712]">
              <iframe
                src={remoteEndpoint.remoteAccess.launchUrl}
                title={`Remote session for ${remoteEndpoint.displayName}`}
                className="h-full w-full border-0"
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
