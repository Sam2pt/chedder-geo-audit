import { ImageResponse } from "next/og";
import { getAudit } from "@/lib/audit-store";

// Route segment config — image is regenerated per-slug at request time so
// it reflects the latest saved audit (scores change as users re-run).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Chedder AI Search Visibility audit";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function scoreColor(s: number) {
  if (s >= 70) return { bg: "#34c759", text: "#248a3d", light: "#d4f4dd" };
  if (s >= 40) return { bg: "#ff9f0a", text: "#c77c02", light: "#fff0d6" };
  return { bg: "#ff453a", text: "#d70015", light: "#ffd9d6" };
}

function getGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "A-";
  if (score >= 70) return "B";
  if (score >= 60) return "B-";
  if (score >= 50) return "C";
  if (score >= 40) return "C-";
  if (score >= 30) return "D";
  return "F";
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const audit = await getAudit(slug).catch(() => null);

  // Graceful fallback if the audit doesn't exist — still serve a branded
  // card so social scrapers don't error out.
  const domain = audit?.domain ?? "chedder.2pt.ai";
  const score = audit?.overallScore ?? 0;
  const grade = audit?.grade || getGrade(score);
  const c = scoreColor(score);

  // Pull a headline competitor (if any) to make the card actually useful
  // to readers.
  const topCompetitor = audit?.aiCompetitors?.[0]?.domain;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "linear-gradient(135deg, #ffffff 0%, #fafafa 60%, #f5f5f7 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top bar: Chedder wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, #FFB800 0%, #E5A500 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            }}
          >
            <svg viewBox="0 0 100 100" width={32} height={32}>
              <circle cx={34} cy={37} r={8} fill="#8a5c00" />
              <circle cx={64} cy={33} r={5} fill="#8a5c00" />
              <circle cx={58} cy={62} r={10} fill="#8a5c00" />
              <circle cx={32} cy={67} r={5} fill="#8a5c00" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#1d1d1f",
            }}
          >
            Chedder
          </div>
          <div
            style={{
              marginLeft: 18,
              paddingLeft: 18,
              borderLeft: "1px solid rgba(0,0,0,0.12)",
              fontSize: 20,
              color: "#6e6e73",
            }}
          >
            AI Search Visibility
          </div>
        </div>

        {/* Middle: domain + score */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 48,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
            <div
              style={{
                fontSize: 24,
                color: "#6e6e73",
                marginBottom: 8,
              }}
            >
              Audit for
            </div>
            <div
              style={{
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                color: "#1d1d1f",
                lineHeight: 1.05,
              }}
            >
              {domain}
            </div>
            {topCompetitor && (
              <div
                style={{
                  marginTop: 22,
                  fontSize: 22,
                  color: "#6e6e73",
                  lineHeight: 1.4,
                }}
              >
                AI recommends {topCompetitor} in the same category.
              </div>
            )}
          </div>

          {/* Score + grade card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 260,
              height: 260,
              borderRadius: 32,
              background: c.light,
              border: `3px solid ${c.bg}`,
              boxShadow: `0 8px 32px ${c.bg}40`,
            }}
          >
            <div
              style={{
                fontSize: 120,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: c.text,
                lineHeight: 1,
              }}
            >
              {score}
            </div>
            <div
              style={{
                fontSize: 22,
                color: c.text,
                marginTop: 10,
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              GRADE {grade}
            </div>
          </div>
        </div>

        {/* Bottom: tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 18,
            color: "#86868b",
          }}
        >
          <div>
            Where does your brand show up when customers ask AI?
          </div>
          <div style={{ fontWeight: 600, color: "#1d1d1f" }}>
            chedder.2pt.ai
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
