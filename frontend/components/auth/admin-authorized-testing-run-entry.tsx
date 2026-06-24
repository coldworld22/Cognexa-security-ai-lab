"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { AuthorizedSecurityTestReportView } from "@/components/admin/authorized-security-test-report-view";
import { Card } from "@/components/ui/card";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { getAuthorizedSecurityTestRun } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AuthorizedSecurityTestReport } from "@/lib/types";

interface AdminAuthorizedTestingRunEntryProps {
  runId: string;
}

export function AdminAuthorizedTestingRunEntry({
  runId
}: AdminAuthorizedTestingRunEntryProps) {
  const { t } = useI18n();
  const [report, setReport] = useState<AuthorizedSecurityTestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setIsLoading(true);
      setError(null);

      try {
        const nextReport = await getAuthorizedSecurityTestRun(runId);
        if (!active) {
          return;
        }

        setReport(nextReport);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : t("authorizedTesting.reportLoadFailed")
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [runId, t]);

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="authorized-testing"
        title={`${t("authorizedTesting.screenTitle")} · Report`}
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
              Run ID: {runId}
            </p>
          </div>

          {isLoading ? (
            <Card className="bg-white/82 p-6 text-sm text-[var(--text-secondary)]">
              Loading authorized testing report...
            </Card>
          ) : null}

          {error ? (
            <Card className="border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error}
            </Card>
          ) : null}

          {report ? (
            <Card className="space-y-5 bg-white/82 p-5">
              <AuthorizedSecurityTestReportView report={report} />
            </Card>
          ) : null}
        </div>
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
