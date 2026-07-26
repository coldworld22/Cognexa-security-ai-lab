"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { MobileErrorBoundary } from "@/components/admin/mobile/mobile-error-boundary";
import { MobileScannerConsole } from "@/components/admin/mobile/mobile-scanner-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminMobileScannerEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="mobile-scanner"
        title={t("mobileScanner.screenTitle")}
        description={t("mobileScanner.screenDescription")}
      >
        <MobileErrorBoundary>
          <MobileScannerConsole />
        </MobileErrorBoundary>
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
