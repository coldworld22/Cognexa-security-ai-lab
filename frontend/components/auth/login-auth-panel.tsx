"use client";

import { LockKeyhole } from "lucide-react";

import { AppIdentity } from "@/components/ui/app-identity";
import { useI18n } from "@/lib/i18n";

import { AuthForm } from "./auth-form";

export function LoginAuthPanel() {
  const { t } = useI18n();

  return (
    <aside className="order-1 flex justify-center lg:order-2 lg:justify-end">
      <div className="login-fade-up login-fade-up-delay-1 w-full max-w-[420px] rounded-[28px] bg-[rgba(9,16,30,0.82)] p-7 shadow-[0_28px_80px_rgba(2,6,23,0.38)] ring-1 ring-white/10 backdrop-blur-xl sm:p-9">
        <AppIdentity tone="dark" size="sm" showSubtitle={false} showTagline={false} />

        <h2 className="mt-8 text-3xl font-semibold tracking-[-0.04em] text-white">
          {t("login.welcomeBack")}
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-400">
          {t("login.accessDescription")}
        </p>

        <AuthForm />

        <div className="mt-6 border-t border-white/8 pt-5">
          <p className="inline-flex items-start gap-2 text-sm leading-6 text-slate-400">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-sky-300" />
            <span>{t("login.protectedNotice")}</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
