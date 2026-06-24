"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({
  className,
  compact = false
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const options = [
    {
      id: "en",
      label: t("language.english"),
      shortLabel: "EN"
    },
    {
      id: "ar",
      label: t("language.arabic"),
      shortLabel: "ع"
    }
  ] as const;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 text-white shadow-[0_12px_32px_rgba(2,6,23,0.18)] backdrop-blur-xl",
        className
      )}
      role="group"
      aria-label={t("language.label")}
    >
      {!compact ? (
        <span className="inline-flex items-center gap-2 px-3 text-xs font-medium text-slate-300">
          <Languages className="size-3.5" />
          {t("language.label")}
        </span>
      ) : (
        <span className="inline-flex items-center px-2 text-slate-300">
          <Languages className="size-3.5" />
        </span>
      )}
      {options.map((option) => {
        const active = option.id === locale;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setLocale(option.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              active
                ? "bg-[#3b82f6] text-white shadow-[0_12px_24px_rgba(59,130,246,0.24)]"
                : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            )}
            aria-pressed={active}
            title={option.label}
          >
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold ring-1",
                active
                  ? "bg-white/18 text-white ring-white/20"
                  : "bg-white/[0.04] text-slate-200 ring-white/10"
              )}
            >
              {option.shortLabel}
            </span>
            {!compact ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
