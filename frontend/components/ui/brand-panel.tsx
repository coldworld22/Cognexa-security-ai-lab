import { BrandLogo } from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

interface BrandPanelProps {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
  tone?: "light" | "dark" | "brand";
}

const toneClassNames: Record<NonNullable<BrandPanelProps["tone"]>, string> = {
  light:
    "border-[#d8e2ea] bg-[linear-gradient(135deg,#f7fbff_0%,#e8eef4_55%,#dbe4eb_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.10)]",
  dark:
    "border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.04)_100%)] shadow-[0_24px_60px_rgba(0,0,0,0.22)]",
  brand:
    "border-white/12 bg-[linear-gradient(155deg,#091421_0%,#10314b_42%,#0c6883_100%)] shadow-[0_34px_80px_rgba(5,12,20,0.38)]"
};

export function BrandPanel({
  className,
  imageClassName,
  priority = false,
  sizes,
  tone = "light"
}: BrandPanelProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[28px] border p-3 backdrop-blur",
        toneClassNames[tone],
        className
      )}
    >
      <BrandLogo
        priority={priority}
        sizes={sizes}
        className={cn("rounded-[20px]", imageClassName)}
      />
    </div>
  );
}
