/**
 * Logo — the formal Chedder wordmark.
 *
 *   <Logo />              // default ~28px, used in nav
 *   <Logo size="lg" />    // ~40px, used in sign-in, OG fallback
 *   <Logo size="xs" />    // ~20px, used in compact contexts
 *   <Logo dotOnly />      // just the coral dot, used as inline bullet
 *
 * The mark is a small coral dot to the left of "Chedder" set in a
 * tight geometric sans (Inter via the global font stack). The dot is
 * the same coral as Spark — the formal mark and the character share
 * a color signature, but the formal mark is never the character.
 *
 * Renders as a real <a href="/"> so every nav usage is a link by
 * default. Pass `as="span"` for the rare contexts (sign-in page hero,
 * email-header static render) where the click would be a no-op.
 */

import Link from "next/link";
import { CSSProperties } from "react";
import clsx from "clsx";

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LogoProps {
  size?: LogoSize;
  /** Render as a static span (no link). Used on the sign-in / 404 pages. */
  as?: "link" | "span";
  /** Use a white wordmark + coral dot for dark backgrounds. */
  inverted?: boolean;
  /** Show only the coral dot. */
  dotOnly?: boolean;
  className?: string;
  style?: CSSProperties;
}

const sizeMap: Record<LogoSize, { fontPx: number; dotPx: number; gapPx: number }> = {
  xs: { fontPx: 14, dotPx: 6, gapPx: 6 },
  sm: { fontPx: 17, dotPx: 7, gapPx: 7 },
  md: { fontPx: 20, dotPx: 8, gapPx: 8 },
  lg: { fontPx: 28, dotPx: 10, gapPx: 10 },
  xl: { fontPx: 40, dotPx: 14, gapPx: 14 },
};

export function Logo({
  size = "md",
  as = "link",
  inverted = false,
  dotOnly = false,
  className,
  style,
}: LogoProps) {
  const { fontPx, dotPx, gapPx } = sizeMap[size];
  const textColor = inverted ? "#ffffff" : "var(--foreground, #0f172a)";

  const content = (
    <span
      className={clsx("inline-flex items-center", className)}
      style={{ gap: `${gapPx}px`, color: textColor, ...style }}
    >
      <span
        aria-hidden
        style={{
          width: dotPx,
          height: dotPx,
          borderRadius: "999px",
          background: "var(--brand-coral, #ff5e47)",
          flexShrink: 0,
        }}
      />
      {!dotOnly && (
        <span
          style={{
            fontSize: `${fontPx}px`,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif",
          }}
        >
          Chedder
        </span>
      )}
    </span>
  );

  if (as === "span") return content;

  return (
    <Link href="/" aria-label="Chedder · home" className="inline-flex">
      {content}
    </Link>
  );
}
