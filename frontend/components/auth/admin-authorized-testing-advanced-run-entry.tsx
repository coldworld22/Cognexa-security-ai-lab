"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { AdvancedPenetrationTestReportView } from "@/components/admin/advanced-penetration-test-report-view";
import { Card } from "@/components/ui/card";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { getAdvancedPenetrationTestRun } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvancedPenetrationTestRunDetail } from "@/lib/types";

interface AdminAuthorizedTestingAdvancedRunEntryProps {
  runId: string;
}

export function AdminAuthorizedTestingAdvancedRunEntry({
  runId
}: AdminAuthorizedTestingAdvancedRunEntryProps) {
  const { t } = useI18n();
  const [run, setRun] = useState<AdvancedPenetrationTestRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRun() {
      setIsLoading(true);
      setError(null);

      try {
        const nextRun = await getAdvancedPenetrationTestRun(runId);
        if (!active) {
          return;
        }

        setRun(nextRun);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load the advanced penetration test run."
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadRun();

    return () => {
      active = false;
    };
  }, [runId]);

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="authorized-testing"
        title={`${t("authorizedTesting.screenTitle")} - Advanced run`}
        description={t("authorizedTesting.screenDescription")}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/authorized-testing"
              className="inline-flex items-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03]"
            >
              Back to Authorized Testing
            </Link>
            <p className="text-xs uppercase tracking-[0.18em] text-black/45">
              Advanced Run ID: {runId}
            </p>
          </div>

          {isLoading ? (
            <Card className="bg-white/82 p-6 text-sm text-[var(--text-secondary)]">
              Loading advanced penetration test run...
            </Card>
          ) : null}

          {error ? (
            <Card className="border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error}
            </Card>
          ) : null}

          {run ? (
            <Card className="space-y-5 bg-white/82 p-5">
              <AdvancedPenetrationTestReportView run={run} />
            </Card>
          ) : null}
        </div>
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
