import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface BadgeProps extends PropsWithChildren {
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-black/10 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-black/58 backdrop-blur",
        className
      )}
    >
      {children}
    </span>
  );
}
