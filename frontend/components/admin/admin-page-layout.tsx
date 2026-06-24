"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AdminView =
  | "dashboard"
  | "network-monitor"
  | "authorized-testing"
  | "website-scanner"
  | "policies"
  | "security-review";

interface AdminPageLayoutProps {
  currentView: AdminView;
  title: string;
  description: string;
  children: ReactNode;
}

export function AdminPageLayout({
  currentView,
  title,
  description,
  children
}: AdminPageLayoutProps) {
  const { t } = useI18n();

  const navItems: Array<{
    href: string;
    label: string;
    view: AdminView;
  }> = [
    {
      href: "/admin",
      label: t("admin.dashboard"),
      view: "dashboard"
    },
    {
      href: "/admin/network-monitor",
      label: t("adminNetwork.navLabel"),
      view: "network-monitor"
    },
    {
      href: "/admin/authorized-testing",
      label: t("authorizedTesting.navLabel"),
      view: "authorized-testing"
    },
    {
      href: "/admin/website-scanner",
      label: t("websiteScanner.navLabel"),
      view: "website-scanner"
    },
    {
      href: "/admin/policies",
      label: t("policy.navLabel"),
      view: "policies"
    },
    {
      href: "/admin/security-review",
      label: t("securityReview.navLabel"),
      view: "security-review"
    }
  ];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef2ea_0%,_#e4ddcf_100%)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active = item.view === currentView;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-[#1a78cf]/30 bg-[linear-gradient(135deg,rgba(21,167,243,0.18)_0%,rgba(13,123,213,0.08)_100%)] text-[var(--text-primary)] shadow-[0_8px_24px_rgba(21,167,243,0.12)]"
                      : "border-black/10 bg-white/72 text-[var(--text-secondary)] hover:bg-white"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <LanguageSwitcher className="border-black/10 bg-white/70 text-[var(--text-primary)] shadow-none [&_span]:text-[var(--text-secondary)]" compact />
        </div>

        <Card className="bg-pine text-sand">
          <p className="text-xs uppercase tracking-[0.24em] text-sand/70">
            {t("admin.dashboard")}
          </p>
          <h1 className="mt-2 text-4xl font-semibold">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-sand/80">{description}</p>
        </Card>

        {children}
      </div>
    </main>
  );
}
