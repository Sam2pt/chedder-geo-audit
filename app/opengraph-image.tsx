import { ImageResponse } from "next/og";

// Root-level OG image for the landing page. Served at /opengraph-image for
// every social share that links to the homepage (Slack, LinkedIn, X,
// iMessage, etc.). Rendered at build time and cached at the edge.

export const runtime = "nodejs";
export const alt = "Chedder · AI Search Visibility for consumer brands";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#FAFAF7",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(255, 184, 0, 0.22) 0%, transparent 42%), radial-gradient(circle at 10% 90%, rgba(0, 113, 227, 0.12) 0%, transparent 45%), radial-gradient(circle at 60% 65%, rgba(236, 72, 153, 0.08) 0%, transparent 50%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top row: brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 68,
              height: 68,
              borderRadius: 18,
              background: "linear-gradient(135deg, #FFB800, #E5A500)",
            }}
          >
            {/* Simplified cheese wedge */}
            <svg width="40" height="40" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="#fff" fillOpacity="0.18" />
              <circle cx="34" cy="37" r="6" fill="#C88700" />
              <circle cx="64" cy="33" r="4" fill="#C88700" />
              <circle cx="58" cy="62" r="8" fill="#C88700" />
              <circle cx="32" cy="67" r="4" fill="#C88700" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#1d1d1f",
              display: "flex",
            }}
          >
            Chedder
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 14px",
              borderRadius: 999,
              backgroundColor: "rgba(29, 29, 31, 0.06)",
              color: "#6b6b70",
              fontSize: 18,
              fontWeight: 500,
              marginLeft: 4,
            }}
          >
            Generative Engine Optimization
          </div>
        </div>

        {/* Main headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 900,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
              color: "#1d1d1f",
            }}
          >
            <div style={{ display: "flex" }}>When AI answers,</div>
            <div
              style={{
                display: "flex",
                background: "linear-gradient(90deg, #0071e3, #8b5cf6, #ec4899)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              is your brand mentioned?
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              lineHeight: 1.45,
              color: "#5a5a60",
              maxWidth: 900,
            }}
          >
            Audit how your brand shows up in ChatGPT, Perplexity, and Brave
            Search. Free. Under a minute.
          </div>
        </div>

        {/* Bottom trust row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontSize: 18,
            fontWeight: 500,
            color: "#6b6b70",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Check />
            Real AI queries tested
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Check />
            7 signals scored
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Check />
            Action plan delivered
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              color: "#8b8b90",
              fontSize: 16,
            }}
          >
            chedder.2pt.ai
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 6L9 17l-5-5"
        stroke="#34c759"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
