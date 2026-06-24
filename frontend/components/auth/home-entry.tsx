"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { getStoredSession } from "@/lib/api";
import { AppIdentity } from "@/components/ui/app-identity";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

const AssistantWorkspace = dynamic(
  () =>
    import("@/components/app/assistant-workspace").then((module) => module.AssistantWorkspace),
  {
    ssr: false
  }
);

export function HomeEntry() {
  const router = useRouter();
  const { t } = useI18n();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    setHasSession(Boolean(getStoredSession()));
  }, []);

  useEffect(() => {
    if (hasSession === false) {
      router.replace("/login");
    }
  }, [hasSession, router]);

  if (hasSession) {
    return <AssistantWorkspace />;
  }

  const isRedirecting = hasSession === false;

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
            {isRedirecting ? t("home.redirecting") : t("home.preparing")}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#111827]">
            {isRedirecting ? t("home.openingSecureSignIn") : t("home.connecting")}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/60">
            {isRedirecting
              ? t("home.redirectDescription")
              : t("home.preparingDescription")}
          </p>
        </Card>
      </div>
    </main>
  );
}
