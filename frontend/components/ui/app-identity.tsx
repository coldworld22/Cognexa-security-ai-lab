"use client";

import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface AppIdentityProps {
  className?: string;
  showSubtitle?: boolean;
  showTagline?: boolean;
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}

const sizeClassNames: Record<
  NonNullable<AppIdentityProps["size"]>,
  {
    shell: string;
    glyph: string;
    ring: string;
    title: string;
    subtitle: string;
    tagline: string;
  }
> = {
  sm: {
    shell: "gap-3",
    glyph: "size-10 rounded-[18px]",
    ring: "inset-[8px]",
    title: "text-lg",
    subtitle: "text-[11px]",
    tagline: "text-xs"
  },
  md: {
    shell: "gap-4",
    glyph: "size-12 rounded-[20px]",
    ring: "inset-[9px]",
    title: "text-[1.4rem]",
    subtitle: "text-[11px]",
    tagline: "text-sm"
  },
  lg: {
    shell: "gap-4",
    glyph: "size-14 rounded-[22px]",
    ring: "inset-[10px]",
    title: "text-[1.75rem]",
    subtitle: "text-xs",
    tagline: "text-base"
  }
};

const toneClassNames: Record<
  NonNullable<AppIdentityProps["tone"]>,
  {
    title: string;
    subtitle: string;
    tagline: string;
    glyph: string;
    stroke: string;
    dot: string;
  }
> = {
  light: {
    title: "text-[var(--text-primary)]",
    subtitle: "text-[var(--text-tertiary)]",
    tagline: "text-[var(--text-secondary)]",
    glyph:
      "bg-[linear-gradient(145deg,#14adf5_0%,#0f83dc_52%,#0a456e_100%)] shadow-[0_18px_40px_rgba(21,167,243,0.28)]",
    stroke: "border-white/90",
    dot: "bg-white"
  },
  dark: {
    title: "text-white",
    subtitle: "text-white/46",
    tagline: "text-white/70",
    glyph:
      "bg-[linear-gradient(145deg,#16b2f6_0%,#0f7dd6_50%,#0a304f_100%)] shadow-[0_22px_52px_rgba(0,0,0,0.32)]",
    stroke: "border-white/85",
    dot: "bg-[#e8fbff]"
  }
};

export function AppIdentity({
  className,
  showSubtitle = true,
  showTagline = true,
  tone = "light",
  size = "md"
}: AppIdentityProps) {
  const { t } = useI18n();
  const scale = sizeClassNames[size];
  const toneStyles = toneClassNames[tone];

  return (
    <div className={cn("flex items-start", scale.shell, className)}>
      <div className={cn("relative shrink-0 overflow-hidden", scale.glyph, toneStyles.glyph)}>
        <span
          className={cn(
            "absolute rounded-[inherit] border-[2px] border-r-transparent",
            scale.ring,
            toneStyles.stroke
          )}
        />
        <span className={cn("absolute left-[22%] top-[50%] size-2.5 -translate-y-1/2 rounded-full", toneStyles.dot)} />
        <span className={cn("absolute right-[22%] top-[24%] size-2 rounded-full", toneStyles.dot)} />
        <span className={cn("absolute right-[24%] bottom-[21%] size-2 rounded-full", toneStyles.dot)} />
        <span className="absolute left-[33%] top-[34%] h-[2px] w-[40%] rotate-[16deg] rounded-full bg-white/90" />
        <span className="absolute left-[34%] bottom-[32%] h-[2px] w-[36%] -rotate-[20deg] rounded-full bg-white/78" />
      </div>

      <div className="min-w-0">
        <p className={cn("font-semibold tracking-[-0.03em]", scale.title, toneStyles.title)}>
          {APP_NAME}
        </p>
        {showSubtitle ? (
          <p
            className={cn(
              "mt-1 uppercase tracking-[0.3em]",
              scale.subtitle,
              toneStyles.subtitle
            )}
          >
            {t("brand.aiWorkspace")}
          </p>
        ) : null}
        {showTagline ? (
          <p className={cn("mt-3 max-w-md leading-6", scale.tagline, toneStyles.tagline)}>
            {t("brand.tagline") || APP_TAGLINE}
          </p>
        ) : null}
      </div>
    </div>
  );
}
