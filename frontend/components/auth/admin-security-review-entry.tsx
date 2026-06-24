"use client";

import { AdminPageLayout } from "@/components/admin/admin-page-layout";
import { SecurityReviewLabConsole } from "@/components/admin/security-review-lab-console";
import { AdminAccessGate } from "@/components/auth/admin-access-gate";
import { useI18n } from "@/lib/i18n";

export function AdminSecurityReviewEntry() {
  const { t } = useI18n();

  return (
    <AdminAccessGate>
      <AdminPageLayout
        currentView="security-review"
        title={t("securityReview.screenTitle")}
        description={t("securityReview.screenDescription")}
      >
        <SecurityReviewLabConsole />
      </AdminPageLayout>
    </AdminAccessGate>
  );
}
