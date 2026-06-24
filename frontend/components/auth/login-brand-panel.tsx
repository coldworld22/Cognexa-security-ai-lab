"use client";

import { Bot, BookOpenText, DatabaseZap } from "lucide-react";

import { AppIdentity } from "@/components/ui/app-identity";
import { useI18n } from "@/lib/i18n";

const featureIcons = [Bot, BookOpenText, DatabaseZap] as const;

export function LoginBrandPanel() {
  const { t } = useI18n();
  const featureCards = [
    {
      title: t("login.features.agents.title"),
      description: t("login.features.agents.description")
    },
    {
      title: t("login.features.knowledge.title"),
      description: t("login.features.knowledge.description")
    },
    {
      title: t("login.features.models.title"),
      description: t("login.features.models.description")
    }
  ];

  return (
    <section className="order-2 max-w-3xl lg:order-1">
      <div className="login-fade-up">
        <AppIdentity tone="dark" size="sm" showSubtitle={false} showTagline={false} />

        <div className="mt-8 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300">
          {t("login.badge")}
        </div>

        <h1 className="mt-8 max-w-4xl text-[3.25rem] font-semibold leading-[0.94] tracking-[-0.07em] text-white sm:text-[4rem] xl:text-[4.5rem]">
          {t("login.headlineLine1")}
          <span className="block text-slate-200">{t("login.headlineLine2")}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          {t("login.description")}
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {featureCards.map((card, index) => {
            const Icon = featureIcons[index];

            return (
              <div
                key={card.title}
                className="login-surface-hover rounded-[24px] bg-white/[0.03] p-6 ring-1 ring-white/8"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/10">
                  <Icon className="size-5" />
                </div>
                <p className="mt-5 text-lg font-semibold text-white">{card.title}</p>
                <p className="mt-3 text-base leading-7 text-slate-400">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
