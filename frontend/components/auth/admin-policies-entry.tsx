"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { PolicyManagementConsole } from "@/components/admin/policy-management-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminPoliciesEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="policies"
        title={t("policy.screenTitle")}
        description={t("policy.screenDescription")}
      >
        <PolicyManagementConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
