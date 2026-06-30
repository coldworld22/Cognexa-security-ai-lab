"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { PrivateModeConsole } from "@/components/admin/private-mode-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminPrivateModeEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="private-mode"
        title={t("privateMode.screenTitle")}
        description={t("privateMode.screenDescription")}
      >
        <PrivateModeConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
