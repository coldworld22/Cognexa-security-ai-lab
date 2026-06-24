"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Eye,
  HardDrive,
  Monitor,
  Network,
  Plus,
  RefreshCw,
  Search
} from "lucide-react";

import { CreateMonitoredEndpointPayload } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  EndpointInventory,
  EndpointRiskLevel,
  EndpointStatus,
  MonitoredEndpoint
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface EndpointsViewProps {
  inventory: EndpointInventory | null;
  error: string | null;
  isDiscovering: boolean;
  isRefreshing: boolean;
  onCreateEndpoint: (
    payload: CreateMonitoredEndpointPayload
  ) => void | Promise<void>;
  onDiscoverInventory: () => void | Promise<void>;
  onRefreshInventory: () => void | Promise<void>;
}

interface EndpointFormState {
  displayName: string;
  hostname: string;
  ipAddress: string;
  subnet: string;
  operatingSystem: string;
  loggedInUser: string;
  tags: string;
}

const DEFAULT_FORM: EndpointFormState = {
  displayName: "",
  hostname: "",
  ipAddress: "",
  subnet: "",
  operatingSystem: "Windows 11",
  loggedInUser: "",
  tags: ""
};

function endpointStatusClass(status: EndpointStatus): string {
  switch (status) {
    case "online":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function endpointRiskClass(riskLevel: EndpointRiskLevel): string {
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

function formatPercentage(
  value: number | undefined,
  formatNumber: (value: number) => string,
  fallback: string
): string {
  if (typeof value !== "number") {
    return fallback;
  }

  return `${formatNumber(value)}%`;
}

export function EndpointsView({
  inventory,
  error,
  isDiscovering,
  isRefreshing,
  onCreateEndpoint,
  onDiscoverInventory,
  onRefreshInventory
}: EndpointsViewProps) {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EndpointStatus>("all");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const endpoints = inventory?.endpoints ?? [];
  const filteredEndpoints = endpoints.filter((endpoint) => {
    const matchesStatus = statusFilter === "all" || endpoint.status === statusFilter;
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return matchesStatus;
    }

    return (
      matchesStatus &&
      [
        endpoint.displayName,
        endpoint.hostname,
        endpoint.ipAddress,
        endpoint.operatingSystem,
        endpoint.subnet,
        endpoint.loggedInUser ?? "",
        endpoint.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  });

  useEffect(() => {
    if (filteredEndpoints.length === 0) {
      setSelectedEndpointId(null);
      return;
    }

    setSelectedEndpointId((current) =>
      current && filteredEndpoints.some((endpoint) => endpoint.id === current)
        ? current
        : filteredEndpoints[0]!.id
    );
  }, [filteredEndpoints]);

  const selectedEndpoint =
    filteredEndpoints.find((endpoint) => endpoint.id === selectedEndpointId) ??
    filteredEndpoints[0] ??
    null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await onCreateEndpoint({
        displayName: form.displayName.trim(),
        hostname: form.hostname.trim(),
        ipAddress: form.ipAddress.trim(),
        subnet: form.subnet.trim(),
        operatingSystem: form.operatingSystem.trim(),
        loggedInUser: form.loggedInUser.trim() || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setForm(DEFAULT_FORM);
    } catch {
      // Parent state surfaces the create error in the panel.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.95fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("endpoints.title")}
            </h3>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {t("endpoints.headline")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {t("endpoints.description")}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("endpoints.total")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(inventory?.summary.total ?? 0)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("endpoints.onlineNow")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(inventory?.summary.online ?? 0)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("endpoints.needsAttention")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber((inventory?.summary.degraded ?? 0) + (inventory?.summary.offline ?? 0))}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("endpoints.activeAlerts")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(inventory?.summary.activeAlerts ?? 0)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("endpoints.visibilityTitle")}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {t("endpoints.visibilityDescription")}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("endpoints.inventory")}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {t("endpoints.sameNetworkOnly")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void onDiscoverInventory();
              }}
              disabled={isDiscovering || isRefreshing}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1a78cf]/20 bg-[linear-gradient(135deg,rgba(21,167,243,0.12)_0%,rgba(13,123,213,0.04)_100%)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search className={cn("size-4", isDiscovering && "animate-pulse")} />
              {isDiscovering ? t("endpoints.discovering") : t("endpoints.discoverInventory")}
            </button>
            <button
              type="button"
              onClick={() => {
                void onRefreshInventory();
              }}
              disabled={isRefreshing || isDiscovering}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
              {t("endpoints.refreshInventory")}
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("endpoints.searchPlaceholder")}
                className="w-full rounded-[22px] border border-black/10 bg-white/84 py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | EndpointStatus)}
              className="rounded-[22px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            >
              <option value="all">{t("endpoints.allStatuses")}</option>
              <option value="online">{t("common.status.online")}</option>
              <option value="degraded">{t("common.status.degraded")}</option>
              <option value="offline">{t("common.status.offline")}</option>
            </select>
          </div>

          {error ? (
            <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {endpoints.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
                {t("endpoints.noEndpoints")}
              </div>
            ) : filteredEndpoints.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
                {t("endpoints.emptySearch")}
              </div>
            ) : (
              filteredEndpoints.map((endpoint) => (
                <button
                  key={endpoint.id}
                  type="button"
                  onClick={() => setSelectedEndpointId(endpoint.id)}
                  className={cn(
                    "w-full rounded-[22px] border p-4 text-left transition",
                    selectedEndpoint?.id === endpoint.id
                      ? "border-[#1a78cf]/25 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)]"
                      : "border-black/6 bg-[var(--surface-soft)] hover:bg-white"
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {endpoint.displayName}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {endpoint.hostname} / {endpoint.ipAddress}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={endpointStatusClass(endpoint.status)}>
                        {t(`common.status.${endpoint.status}`)}
                      </Badge>
                      <Badge className={endpointRiskClass(endpoint.riskLevel)}>
                        {t(`endpoints.riskLevels.${endpoint.riskLevel}`)}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>{endpoint.operatingSystem}</Badge>
                    <Badge>{endpoint.subnet}</Badge>
                    {endpoint.tags.map((tag) => (
                      <Badge key={`${endpoint.id}-${tag}`} className="bg-white/85 text-[var(--text-secondary)]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("endpoints.addEndpoint")}
            </h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {t("endpoints.formDescription")}
          </p>

          <form className="mt-5 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
            <input
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder={t("endpoints.name")}
              className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              required
            />
            <input
              value={form.hostname}
              onChange={(event) => setForm((current) => ({ ...current, hostname: event.target.value }))}
              placeholder={t("endpoints.hostname")}
              className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              required
            />
            <input
              value={form.ipAddress}
              onChange={(event) => setForm((current) => ({ ...current, ipAddress: event.target.value }))}
              placeholder={t("endpoints.ipAddress")}
              className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.subnet}
                onChange={(event) => setForm((current) => ({ ...current, subnet: event.target.value }))}
                placeholder={t("endpoints.subnet")}
                className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                required
              />
              <input
                value={form.operatingSystem}
                onChange={(event) => setForm((current) => ({ ...current, operatingSystem: event.target.value }))}
                placeholder={t("endpoints.operatingSystem")}
                className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                required
              />
            </div>
            <input
              value={form.loggedInUser}
              onChange={(event) => setForm((current) => ({ ...current, loggedInUser: event.target.value }))}
              placeholder={t("endpoints.loggedInUser")}
              className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            />
            <input
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder={t("endpoints.tags")}
              className="w-full rounded-[20px] border border-black/10 bg-white/84 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            />
            <p className="text-xs text-[var(--text-tertiary)]">{t("endpoints.tagsHint")}</p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="size-4" />
              {isSubmitting ? t("common.save") : t("endpoints.saveEndpoint")}
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-[var(--brand-blue)]" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              {t("endpoints.endpointDetails")}
            </h3>
          </div>

          {!selectedEndpoint ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
              {t("endpoints.noSelection")}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {selectedEndpoint.displayName}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {selectedEndpoint.hostname} / {selectedEndpoint.ipAddress}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={endpointStatusClass(selectedEndpoint.status)}>
                      {t(`common.status.${selectedEndpoint.status}`)}
                    </Badge>
                    <Badge className={endpointRiskClass(selectedEndpoint.riskLevel)}>
                      {t(`endpoints.riskLevels.${selectedEndpoint.riskLevel}`)}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-black/6 bg-white/84 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("endpoints.operatingSystem")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {selectedEndpoint.operatingSystem}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/84 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("endpoints.loggedInUser")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {selectedEndpoint.loggedInUser ?? t("common.unavailable")}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/84 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("endpoints.subnet")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {selectedEndpoint.subnet}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-black/6 bg-white/84 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("endpoints.lastSeen")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {selectedEndpoint.lastSeenAt
                        ? formatDateTime(selectedEndpoint.lastSeenAt)
                        : t("common.unavailable")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEndpoint.tags.length === 0 ? (
                    <Badge>{t("common.unavailable")}</Badge>
                  ) : (
                    selectedEndpoint.tags.map((tag) => (
                      <Badge key={`${selectedEndpoint.id}-${tag}`}>{tag}</Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("endpoints.latency")}
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                    {typeof selectedEndpoint.telemetry.latencyMs === "number"
                      ? `${formatNumber(selectedEndpoint.telemetry.latencyMs)} ms`
                      : t("common.unavailable")}
                  </p>
                </div>
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("endpoints.activeAlerts")}
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                    {formatNumber(selectedEndpoint.telemetry.activeAlerts ?? 0)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("endpoints.cpu")}
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                    {formatPercentage(
                      selectedEndpoint.telemetry.cpuUsagePercent,
                      formatNumber,
                      t("common.unavailable")
                    )}
                  </p>
                </div>
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("endpoints.disk")}
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                    {formatPercentage(
                      selectedEndpoint.telemetry.diskUsagePercent,
                      formatNumber,
                      t("common.unavailable")
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("endpoints.memory")}
                </p>
                <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  {formatPercentage(
                    selectedEndpoint.telemetry.memoryUsagePercent,
                    formatNumber,
                    t("common.unavailable")
                  )}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
