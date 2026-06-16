import Image from "next/image";

import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function BrandLogo({
  className,
  priority = false,
  sizes = "(max-width: 768px) 220px, 320px"
}: BrandLogoProps) {
  return (
    <Image
      src="/Cognexa.png"
      alt={`${APP_NAME} logo`}
      width={1536}
      height={1024}
      priority={priority}
      sizes={sizes}
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}
