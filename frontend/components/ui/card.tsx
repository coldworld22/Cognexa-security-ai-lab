import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-black/10 bg-sand/80 p-5 shadow-panel backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
