import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[32px] border border-white/70 bg-[var(--surface)] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}
