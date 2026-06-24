"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { AuthorizedSecurityTestingConsole } from "@/components/admin/authorized-security-testing-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminAuthorizedTestingEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="authorized-testing"
        title={t("authorizedTesting.screenTitle")}
        description={t("authorizedTesting.screenDescription")}
      >
        <AuthorizedSecurityTestingConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
