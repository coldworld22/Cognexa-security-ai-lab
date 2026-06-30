"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  EyeOff,
  FlaskConical,
  LockKeyhole,
  Radar,
  Shield,
  Wifi
} from "lucide-react";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { MetricsGrid } from "@/components/admin/metrics-grid";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function AdminEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="dashboard"
        title={t("admin.headline")}
        description={t("admin.description")}
      >
        <MetricsGrid />

        <Card className="space-y-4 bg-white/82">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("admin.toolsLabel")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">
              {t("admin.toolsTitle")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {t("admin.toolsDescription")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Link
              href="/admin/network-monitor"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(21,167,243,0.1)] p-3 text-[var(--brand-blue)]">
                <Wifi className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("adminNetwork.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("adminNetwork.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>

            <Link
              href="/admin/private-mode"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(15,23,42,0.08)] p-3 text-[#0f172a]">
                <EyeOff className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("privateMode.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("privateMode.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>

            <Link
              href="/admin/authorized-testing"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(220,38,38,0.08)] p-3 text-[#b91c1c]">
                <FlaskConical className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("authorizedTesting.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("authorizedTesting.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>

            <Link
              href="/admin/website-scanner"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(29,78,216,0.1)] p-3 text-[#1d4ed8]">
                <Radar className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("websiteScanner.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("websiteScanner.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>

            <Link
              href="/admin/policies"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(245,158,11,0.12)] p-3 text-[#b45309]">
                <Shield className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("policy.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("policy.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>

            <Link
              href="/admin/security-review"
              className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] p-5 transition hover:border-black/14 hover:bg-white"
            >
              <div className="inline-flex rounded-2xl bg-[rgba(15,23,42,0.08)] p-3 text-[#0f172a]">
                <LockKeyhole className="size-5" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                {t("securityReview.navLabel")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {t("securityReview.launchDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                {t("admin.openTool")}
                <ArrowUpRight className="size-4" />
              </div>
            </Link>
          </div>
        </Card>
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
