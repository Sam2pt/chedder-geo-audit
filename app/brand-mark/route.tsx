import { ImageResponse } from "next/og";

/**
 * 512×512 PNG of the Chedder cheese mark, served at /brand-mark.
 * Built for upload to third-party product surfaces — Stripe product
 * image, social profile pictures, Press kits, etc.
 *
 * Same geometry as the favicon (app/icon.tsx) but at the size Stripe
 * Checkout, app stores, and most directories actually want.
 *
 * Stripe accepts JPG/PNG up to 1 MB; this comes in around 8 KB.
 * Right-click → Save image as → upload to Stripe product Image field.
 */

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#f8fafc",
        }}
      >
        {/* Wheel with slice cut, also reads as a C */}
        <svg width="400" height="400" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0c46e" />
              <stop offset="55%" stopColor="#e0a740" />
              <stop offset="100%" stopColor="#a87a25" />
            </linearGradient>
          </defs>
          <path
            d="M 50 50 L 91.6 32.8 A 45 45 0 1 1 67.2 8.4 Z"
            fill="url(#g)"
            stroke="#0f172a"
            strokeOpacity="0.1"
            strokeWidth="1.2"
          />
          <circle cx="32" cy="48" r="4.2" fill="#0f172a" opacity="0.22" />
          <circle cx="45" cy="68" r="2.8" fill="#0f172a" opacity="0.22" />
        </svg>
      </div>
    ),
    {
      width: 512,
      height: 512,
      headers: {
        // Cache for an hour — the image is deterministic; if we change
        // the mark we can bump the path or just wait it out.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    }
  );
}
