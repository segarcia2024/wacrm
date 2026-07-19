import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** `full` = wordmark (`logo-revio.png`); `icon` = square mark (`icon.png`). */
  variant?: "full" | "icon";
  className?: string;
  /** Prefer `true` on the top Header for LCP. */
  priority?: boolean;
  width?: number;
  height?: number;
};

/** Intrinsic ratio of the cropped wordmark (~673×212). */
const FULL_WIDTH = 160;
const FULL_HEIGHT = 50;

export function BrandLogo({
  variant = "full",
  className,
  priority = false,
  width,
  height,
}: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <Image
        src="/icon.png"
        alt="Logo de la marca"
        width={width ?? 32}
        height={height ?? 32}
        priority={priority}
        className={cn("rounded-lg object-contain", className)}
      />
    );
  }

  return (
    <Image
      src="/logo-revio.png"
      alt="Logo de la marca"
      width={width ?? FULL_WIDTH}
      height={height ?? FULL_HEIGHT}
      priority={priority}
      className={cn("h-10 w-auto object-contain object-left", className)}
    />
  );
}
