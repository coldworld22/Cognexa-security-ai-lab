import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface BadgeProps extends PropsWithChildren {
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-pine/20 bg-pine/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-pine",
        className
      )}
    >
      {children}
    </span>
  );
}
