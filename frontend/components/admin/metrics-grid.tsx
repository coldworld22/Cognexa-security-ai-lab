"use client";

import { useEffect, useState } from "react";

import { getAdminDashboard } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdminDashboard, DashboardMetric } from "@/lib/types";
import { Card } from "@/components/ui/card";

interface MetricsGridProps {
  refreshKey?: string | number;
}

function buildMetrics(
  dashboard: AdminDashboard,
  formatCount: (value: number) => string,
  t: (key: string, values?: Record<string, string | number>) => string
): DashboardMetric[] {
  const { conversations, files, toolExecutions, localModel } = dashboard.metrics;

  return [
    {
      label: t("metrics.conversations"),
      value: formatCount(conversations.total),
      change: t("metrics.conversationsChange", {
        count: formatCount(conversations.last7Days)
      })
    },
    {
      label: t("metrics.indexedFiles"),
      value: formatCount(files.indexed),
      change: t("metrics.indexedFilesChange", {
        count: formatCount(files.indexedToday)
      })
    },
    {
      label: t("metrics.toolExecutions"),
      value: formatCount(toolExecutions.total),
      change: t("metrics.toolExecutionsChange", {
        rate: toolExecutions.successRate
      })
    },
    {
      label: t("metrics.localModelLatency"),
      value: localModel.latencyMs === null ? t("common.status.offline") : `${localModel.latencyMs}ms`,
      change:
        localModel.status === "up"
          ? t("metrics.providersAvailable", {
              count: formatCount(localModel.providerCount)
            })
          : t("metrics.modelEndpointUnreachable")
    }
  ];
}

export function MetricsGrid({ refreshKey }: MetricsGridProps) {
  const { formatNumber, t } = useI18n();
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const dashboard = await getAdminDashboard();
        if (!cancelled) {
          setMetrics(buildMetrics(dashboard, formatNumber, t));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : t("metrics.loadFailed")
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [formatNumber, refreshKey, t]);

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <p className="text-xs uppercase tracking-[0.22em] text-red-700">{t("metrics.unavailable")}</p>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="bg-white/70">
            <div className="h-3 w-28 animate-pulse rounded-full bg-black/10" />
            <div className="mt-4 h-10 w-24 animate-pulse rounded-full bg-black/10" />
            <div className="mt-3 h-4 w-36 animate-pulse rounded-full bg-black/10" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="bg-white/70">
          <p className="text-xs uppercase tracking-[0.22em] text-black/50">{metric.label}</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{metric.value}</p>
          <p className="mt-2 text-sm text-black/60">{metric.change}</p>
        </Card>
      ))}
    </div>
  );
}
