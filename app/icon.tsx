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
          background: "linear-gradient(135deg, #d8a23e, #b58632)",
          borderRadius: 14,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="#fff" fillOpacity="0.18" />
          <circle cx="34" cy="37" r="7" fill="#8B5A00" />
          <circle cx="64" cy="33" r="5" fill="#8B5A00" />
          <circle cx="58" cy="62" r="9" fill="#8B5A00" />
          <circle cx="32" cy="67" r="5" fill="#8B5A00" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
