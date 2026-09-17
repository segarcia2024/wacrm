"use client";

import { linkifyText } from "@/lib/utils/linkify";
import { cn } from "@/lib/utils";

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders message body text with http(s)/www URLs as links that open
 * in a new tab. Safe for both inbound and outbound bubbles — links
 * inherit the bubble's text color and only add underline.
 */
export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const parts = linkifyText(text);

  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm", className)}>
      {parts.map((part, i) =>
        part.type === "url" ? (
          <a
            key={`${part.href}-${i}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 break-all hover:opacity-80"
            // Stop bubble-level click handlers (reply / select) from firing.
            onClick={(e) => e.stopPropagation()}
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}
