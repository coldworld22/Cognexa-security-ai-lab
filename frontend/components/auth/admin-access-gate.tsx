"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Card } from "@/components/ui/card";
import { getStoredSession } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const ADMIN_DASHBOARD_ROLES = new Set(["super_admin", "admin", "manager"]);

export function AdminAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [accessState, setAccessState] = useState<
    "loading" | "unauthenticated" | "forbidden" | "authorized"
  >("loading");

  useEffect(() => {
    const session = getStoredSession();

    if (!session?.user?.role) {
      setAccessState("unauthenticated");
      return;
    }

    setAccessState(
      ADMIN_DASHBOARD_ROLES.has(session.user.role) ? "authorized" : "forbidden"
    );
  }, []);

  useEffect(() => {
    if (accessState === "unauthenticated") {
      router.replace("/login");
    }
    if (accessState === "forbidden") {
      router.replace("/");
    }
  }, [accessState, router]);

  if (accessState !== "authorized") {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#eef2ea_0%,_#e4ddcf_100%)] px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex justify-end">
            <LanguageSwitcher className="border-black/10 bg-white/70 text-[var(--text-primary)] shadow-none [&_span]:text-[var(--text-secondary)]" compact />
          </div>
          <Card className="bg-pine text-sand">
            <p className="text-xs uppercase tracking-[0.24em] text-sand/70">
              {t("admin.dashboard")}
            </p>
            <h1 className="mt-2 text-4xl font-semibold">
              {accessState === "unauthenticated" || accessState === "forbidden"
                ? t("home.openingSecureSignIn")
                : t("workspace.connectingTitle")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-sand/80">
              {accessState === "unauthenticated" || accessState === "forbidden"
                ? t("home.redirectDescription")
                : t("workspace.connectingDescription")}
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
