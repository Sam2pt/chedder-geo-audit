import { ImageResponse } from "next/og";

/**
 * Chedder favicon. Rendered at build time as a PNG so it lights up in
 * Safari/Chrome/Firefox tabs without needing a static .ico asset. The
 * cheese wedge motif matches the product's visual identity.
 */

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
        {/* Refined mark: wheel with slice cut, doubles as a C */}
        <svg width="56" height="56" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0c46e" />
              <stop offset="55%" stopColor="#e0a740" />
              <stop offset="100%" stopColor="#a87a25" />
            </linearGradient>
          </defs>
          <path d="M 50 50 L 91.6 32.8 A 45 45 0 1 1 67.2 8.4 Z" fill="url(#g)" stroke="#0f172a" strokeOpacity="0.1" strokeWidth="1.2" />
          <circle cx="32" cy="48" r="4.2" fill="#0f172a" opacity="0.22" />
          <circle cx="45" cy="68" r="2.8" fill="#0f172a" opacity="0.22" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
