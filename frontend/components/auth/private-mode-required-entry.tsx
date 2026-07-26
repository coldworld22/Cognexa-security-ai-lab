"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAuthSessionState, getStoredSession } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AppIdentity } from "@/components/ui/app-identity";
import { Card } from "@/components/ui/card";

export function PrivateModeRequiredEntry() {
  const router = useRouter();
  const { t } = useI18n();
  const [canActivate, setCanActivate] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.tokens?.accessToken) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    void getAuthSessionState()
      .then((authSession) => {
        if (cancelled) {
          return;
        }

        if (authSession.privateMode?.active) {
          router.replace("/");
          return;
        }

        setCanActivate(authSession.privateMode?.canActivate === true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanActivate(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 md:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-7rem] top-12 h-72 w-72 rounded-full bg-[#4fc2fb]/16 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-5rem] h-80 w-80 rounded-full bg-[#0d4673]/12 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-3xl">
        <Card className="border-white/80 bg-[rgba(255,255,255,0.9)] p-10">
          <AppIdentity size="lg" />
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.22em] text-black/40">
            {t("privateMode.requiredPage.label")}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#111827]">
            {canActivate
              ? t("privateMode.requiredPage.activateTitle")
              : t("privateMode.requiredPage.waitTitle")}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/60">
            {canActivate
              ? t("privateMode.requiredPage.activateDescription")
              : t("privateMode.requiredPage.waitDescription")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {canActivate ? (
              <Link
                href="/admin/private-mode"
                className="inline-flex rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105"
              >
                {t("privateMode.requiredPage.openConsole")}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              {t("privateMode.requiredPage.checkAgain")}
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
