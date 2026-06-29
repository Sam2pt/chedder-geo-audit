/**
 * Spark — Chedder's assistant character.
 *
 *   <Spark variant="idle" size={64} animate />
 *
 * Single inline SVG, no external assets. The body color resolves to
 * `var(--brand-coral)` so re-theming the brand re-themes Spark
 * automatically. Eyes and mouth stay slate-900 across variants.
 *
 * Variants pick the face. Animations are scoped: `animate` only
 * triggers movement (blink, bounce) when the variant actually has
 * one defined — passing `animate` on a static variant is a no-op.
 *
 * Used in:
 *   - SparkLoader (variant="auditing")
 *   - Empty states (variant="empty")
 *   - Walkthrough tooltips (variant="idle")
 *   - 404 / error pages (variant="error")
 *   - Pricing success (variant="celebrating")
 *   - Floating help button (variant="idle")
 */

import { CSSProperties } from "react";

export type SparkVariant =
  | "idle"
  | "auditing"
  | "celebrating"
  | "resting"
  | "error"
  | "empty"
  | "thinking"
  | "peeking";

interface SparkProps {
  variant?: SparkVariant;
  /** Pixel size of the rendered SVG. Defaults to 64. */
  size?: number;
  /** Enables blink / bounce loops when the variant supports it. */
  animate?: boolean;
  /** Optional className for layout. */
  className?: string;
  /** Optional inline style. */
  style?: CSSProperties;
  /** Accessible label. Defaults to "Chedder mascot". */
  alt?: string;
}

export function Spark({
  variant = "idle",
  size = 64,
  animate = false,
  className,
  style,
  alt = "Chedder mascot",
}: SparkProps) {
  const coral = "var(--brand-coral, #ff5e47)";
  const ink = "var(--foreground, #0f172a)";
  const sheen = "rgba(255,255,255,0.28)";

  return (
    <svg
      viewBox="0 0 130 134"
      width={size}
      height={(size * 134) / 130}
      role="img"
      aria-label={alt}
      className={className}
      style={style}
    >
      {/* Body — same across all variants */}
      <g>
        {/* Tuft on top (the "spark") */}
        <path
          d="M 56 4 Q 60 18 56 30 M 60 4 Q 68 12 70 24 M 64 6 Q 72 18 70 30"
          stroke={coral}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Blob body — slight bounce on `animate` for auditing variant */}
        <g
          style={
            animate && (variant === "auditing" || variant === "idle")
              ? {
                  transformOrigin: "65px 75px",
                  animation:
                    variant === "auditing"
                      ? "sparkBounce 1.4s ease-in-out infinite"
                      : undefined,
                }
              : undefined
          }
        >
          <path
            d="M 18 60 Q 18 28 60 28 Q 102 28 102 60 Q 102 100 90 112 Q 78 122 60 122 Q 42 122 30 112 Q 18 100 18 60 Z"
            fill={coral}
          />
          {/* Cheek blush — same across variants */}
          <ellipse cx="32" cy="86" rx="6.5" ry="3" fill={sheen} />
          <ellipse cx="92" cy="86" rx="6.5" ry="3" fill={sheen} />
          {renderFace(variant, animate, ink, coral)}
        </g>
        {/* Magnifying glass for the auditing variant — rotates if animated */}
        {variant === "auditing" && (
          <g
            style={
              animate
                ? {
                    transformOrigin: "108px 100px",
                    animation: "sparkWiggle 1.8s ease-in-out infinite",
                  }
                : undefined
            }
          >
            <circle
              cx="108"
              cy="100"
              r="14"
              fill="none"
              stroke={ink}
              strokeWidth="3.4"
            />
            <line
              x1="118"
              y1="110"
              x2="126"
              y2="120"
              stroke={ink}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    </svg>
  );
}

/**
 * Per-variant face. Eyes + mouth. Optional blink animation.
 */
function renderFace(
  variant: SparkVariant,
  animate: boolean,
  ink: string,
  coral: string
) {
  const eyeWhite = "#ffffff";

  switch (variant) {
    case "celebrating":
      return (
        <>
          {/* Closed happy arcs */}
          <path
            d="M 37 64 Q 46 56 55 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 69 64 Q 78 56 87 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          {/* Big open smile */}
          <path
            d="M 46 88 Q 62 104 78 88 Q 62 96 46 88 Z"
            fill={ink}
          />
        </>
      );

    case "resting":
      return (
        <>
          <path
            d="M 37 64 Q 46 60 55 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 69 64 Q 78 60 87 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 50 92 Q 62 96 74 92"
            stroke={ink}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );

    case "error":
      return (
        <>
          {/* X eyes */}
          <line
            x1="36"
            y1="56"
            x2="48"
            y2="68"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <line
            x1="48"
            y1="56"
            x2="36"
            y2="68"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <line
            x1="72"
            y1="56"
            x2="84"
            y2="68"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <line
            x1="84"
            y1="56"
            x2="72"
            y2="68"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          {/* Worried mouth */}
          <path
            d="M 50 100 Q 62 90 74 100"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );

    case "empty":
      return (
        <>
          <Eyes variant="default" animate={animate} ink={ink} eyeWhite={eyeWhite} />
          {/* Small surprised o-mouth */}
          <ellipse cx="62" cy="96" rx="3.5" ry="3" fill={ink} />
        </>
      );

    case "thinking":
      return (
        <>
          {/* Eye left looking up-right */}
          <ellipse cx="46" cy="62" rx="11" ry="13" fill={eyeWhite} />
          <ellipse cx="50" cy="58" rx="5.5" ry="7" fill={ink} />
          <circle cx="52" cy="54" r="2.2" fill="#ffffff" />
          {/* Eye right looking up-right */}
          <ellipse cx="78" cy="62" rx="11" ry="13" fill={eyeWhite} />
          <ellipse cx="82" cy="58" rx="5.5" ry="7" fill={ink} />
          <circle cx="84" cy="54" r="2.2" fill="#ffffff" />
          {/* Pursed mouth */}
          <path
            d="M 54 96 Q 62 92 70 96"
            stroke={ink}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );

    case "auditing":
      // Looks down-right at the magnifying glass
      return (
        <>
          <ellipse cx="46" cy="62" rx="11" ry="13" fill={eyeWhite} />
          <ellipse cx="50" cy="67" rx="5.5" ry="7" fill={ink} />
          <circle cx="52" cy="63" r="2.2" fill="#ffffff" />
          <ellipse cx="78" cy="62" rx="11" ry="13" fill={eyeWhite} />
          <ellipse cx="82" cy="67" rx="5.5" ry="7" fill={ink} />
          <circle cx="84" cy="63" r="2.2" fill="#ffffff" />
          <path
            d="M 50 94 Q 62 100 74 94"
            stroke={ink}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );

    case "peeking":
    case "idle":
    default:
      return (
        <>
          <Eyes variant="default" animate={animate} ink={ink} eyeWhite={eyeWhite} />
          <path
            d="M 50 92 Q 62 102 74 92"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
  }
  // Unreachable but keeps coral param "used" for tree-shaking checks
  void coral;
}

/**
 * The default open eyes. Blinks on a 5s loop when `animate` is true.
 * Implemented by alternating the opacity of the open-eye group with
 * a closed-eye arc — cheaper than computing real SMIL transforms and
 * works without JS rerender.
 */
function Eyes({
  animate,
  ink,
  eyeWhite,
}: {
  variant: "default";
  animate: boolean;
  ink: string;
  eyeWhite: string;
}) {
  return (
    <>
      {/* Open eyes — visible most of the time */}
      <g
        style={
          animate
            ? { animation: "sparkBlinkOpen 5s steps(1, end) infinite" }
            : undefined
        }
      >
        <ellipse cx="46" cy="62" rx="11" ry="13" fill={eyeWhite} />
        <ellipse cx="48" cy="65" rx="5.5" ry="7" fill={ink} />
        <circle cx="50" cy="61" r="2.2" fill="#ffffff" />
        <ellipse cx="78" cy="62" rx="11" ry="13" fill={eyeWhite} />
        <ellipse cx="80" cy="65" rx="5.5" ry="7" fill={ink} />
        <circle cx="82" cy="61" r="2.2" fill="#ffffff" />
      </g>
      {/* Closed eyes — flash visible briefly each 5s cycle */}
      {animate && (
        <g style={{ animation: "sparkBlinkClosed 5s steps(1, end) infinite" }}>
          <path
            d="M 37 64 Q 46 60 55 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 69 64 Q 78 60 87 64"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}
    </>
  );
}
