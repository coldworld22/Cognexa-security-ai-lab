"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { WebsiteScannerConsole } from "@/components/admin/website-scanner-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminWebsiteScannerEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="website-scanner"
        title={t("websiteScanner.screenTitle")}
        description={t("websiteScanner.screenDescription")}
      >
        <WebsiteScannerConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
