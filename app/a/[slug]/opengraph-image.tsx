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

// satori (the renderer next/og uses) requires `display: flex` on every
// element that has children — even children that are just text nodes.
// Keep layouts explicit and simple; avoid `boxShadow`, nested SVG, and
// complex gradients that have burned us before.

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const audit = await getAudit(slug).catch(() => null);

  const domain = audit?.domain ?? "chedder.2pt.ai";
  const score = audit?.overallScore ?? 0;
  const grade = audit?.grade || getGrade(score);
  const c = scoreColor(score);
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
          background: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: "#FFB800",
              border: "3px solid #E5A500",
              marginRight: 14,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              color: "#1d1d1f",
            }}
          >
            Chedder
          </div>
          <div
            style={{
              display: "flex",
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
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: 720,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "#6e6e73",
                marginBottom: 10,
              }}
            >
              Audit for
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 700,
                color: "#1d1d1f",
                lineHeight: 1.05,
              }}
            >
              {domain}
            </div>
            {topCompetitor ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 24,
                  fontSize: 22,
                  color: "#6e6e73",
                }}
              >
                AI recommends {topCompetitor} in the same category.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  marginTop: 24,
                  fontSize: 22,
                  color: "#6e6e73",
                }}
              >
                See how you show up in ChatGPT, Perplexity, and Brave Search.
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
              width: 240,
              height: 240,
              borderRadius: 28,
              background: c.light,
              border: `4px solid ${c.bg}`,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 112,
                fontWeight: 700,
                color: c.text,
                lineHeight: 1,
              }}
            >
              {score}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                color: c.text,
                marginTop: 10,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              GRADE {grade}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 18,
            color: "#86868b",
          }}
        >
          <div style={{ display: "flex" }}>
            Where does your brand show up when customers ask AI?
          </div>
          <div style={{ display: "flex", fontWeight: 600, color: "#1d1d1f" }}>
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
