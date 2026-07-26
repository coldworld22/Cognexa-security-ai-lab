"use client";

import { Info, ShieldCheck, Waypoints } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const HELP_ITEMS = [
  {
    key: "upload",
    icon: Info
  },
  {
    key: "score",
    icon: ShieldCheck
  },
  {
    key: "route",
    icon: Waypoints
  }
] as const;

export function MobileScanHelp() {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {HELP_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.key}
            className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4"
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-[var(--brand-blue)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t(`mobileScanner.help${item.key[0].toUpperCase()}${item.key.slice(1)}Title`)}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {t(
                `mobileScanner.help${item.key[0].toUpperCase()}${item.key.slice(1)}Description`
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
