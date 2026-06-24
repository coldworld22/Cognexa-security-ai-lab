"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { NetworkMonitorConsole } from "@/components/admin/network-monitor-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminNetworkMonitorEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="network-monitor"
        title={t("adminNetwork.screenTitle")}
        description={t("adminNetwork.screenDescription")}
      >
        <NetworkMonitorConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
