"use client";

import { LoginAuthPanel } from "@/components/auth/login-auth-panel";
import { LoginBrandPanel } from "@/components/auth/login-brand-panel";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { dir } = useI18n();

  return (
    <main
      data-theme="dark-login"
      className="relative isolate min-h-screen overflow-hidden bg-[#030712] text-white"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-8rem] h-[22rem] w-[22rem] rounded-full bg-sky-500/12 blur-[140px]" />
        <div className="absolute right-[-8rem] top-[10%] h-[18rem] w-[18rem] rounded-full bg-blue-500/8 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_34%),linear-gradient(180deg,rgba(3,7,18,0.08)_0%,rgba(3,7,18,0.34)_56%,rgba(3,7,18,0.62)_100%)]" />
      </div>

      <div
        className={`absolute top-4 z-20 sm:top-6 lg:top-8 ${dir === "rtl" ? "left-4 sm:left-6 lg:left-8" : "right-4 sm:right-6 lg:right-8"}`}
      >
        <LanguageSwitcher />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-16 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,420px)] xl:gap-20">
          <LoginBrandPanel />
          <LoginAuthPanel />
        </div>
      </div>
    </main>
  );
}
