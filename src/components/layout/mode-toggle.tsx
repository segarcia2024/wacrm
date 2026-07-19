"use client";

import { Moon, Sun } from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

import { useTranslations } from "next-intl";

/**
 * Light/dark mode toggle — a single icon button that flips the app
 * between the two modes. Sun shows in light mode (click → go dark),
 * moon shows in dark mode (click → go light); the label always names
 * the destination so screen-reader users hear what the click does.
 *
 * Renders a fixed placeholder until hydrated so SSR and the first
 * client pass always match (localStorage may differ from DEFAULT_MODE).
 *
 * 40×40 hit target to match the header's other touch controls.
 */
export function ModeToggle({ className }: { className?: string }) {
  const t = useTranslations("ModeToggle");
  const { mode, toggleMode } = useTheme();
  const hydrated = useHydrated();

  const buttonClassName = cn(
    "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    className,
  );

  // Placeholder mirrors DEFAULT_MODE (dark → moon, switch to light).
  if (!hydrated) {
    const placeholderLabel = t("switchMode", { mode: "light" });
    return (
      <button
        type="button"
        aria-label={placeholderLabel}
        title={placeholderLabel}
        className={buttonClassName}
        suppressHydrationWarning
      >
        <Moon className="h-5 w-5" />
      </button>
    );
  }

  const goingTo = mode === "dark" ? "light" : "dark";
  const switchLabel = t("switchMode", { mode: goingTo });

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={switchLabel}
      title={switchLabel}
      className={buttonClassName}
    >
      {mode === "dark" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
