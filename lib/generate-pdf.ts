import jsPDF from "jspdf";
import { AuditResult, Finding, ModuleResult, Recommendation } from "./types";

/**
 * Chedder audit PDF renderer.
 *
 * Design principles:
 *  • Cover page reads like a report deliverable, not a web dashboard
 *    export. Big domain, big score, obvious grade, date + audit ID.
 *  • Every non-cover page has a slim branded header and a page-number
 *    footer so a printed copy still feels continuous.
 *  • Generous whitespace, consistent type scale (28/18/14/10/8pt),
 *    and one accent color (Chedder yellow) plus three status colors.
 *  • We stay on Helvetica (ships with jsPDF, renders the same
 *    server-side and in the browser) and use weight/size/tracking
 *    rather than custom typefaces to establish hierarchy.
 */

// ── Palette ─────────────────────────────────────────────────────────
const COLORS = {
  ink: [29, 29, 31] as const, // #1d1d1f
  subtle: [107, 107, 112] as const, // #6b6b70
  faint: [160, 160, 166] as const, // #a0a0a6
  hairline: [230, 230, 233] as const, // #e6e6e9
  cream: [250, 250, 247] as const, // #fafaf7 (page background accents)
  cheese: [255, 184, 0] as const, // #FFB800
  cheeseDeep: [200, 135, 0] as const, // #C88700
  pass: [52, 199, 89] as const, // #34c759
  warn: [255, 159, 10] as const, // #ff9f0a
  fail: [255, 69, 58] as const, // #ff453a
  priorityHigh: [215, 0, 21] as const, // #d70015
  priorityMed: [199, 124, 2] as const, // #c77c02
  priorityLow: [0, 113, 227] as const, // #0071e3
};

const PAGE = {
  W: 210,
  H: 297,
  margin: 20,
} as const;

const CONTENT_W = PAGE.W - PAGE.margin * 2;

// ── Helpers ─────────────────────────────────────────────────────────
function rgb(doc: jsPDF, c: readonly [number, number, number], kind: "fill" | "text" | "draw") {
  if (kind === "fill") doc.setFillColor(c[0], c[1], c[2]);
  else if (kind === "text") doc.setTextColor(c[0], c[1], c[2]);
  else doc.setDrawColor(c[0], c[1], c[2]);
}

function scoreColor(s: number): readonly [number, number, number] {
  if (s >= 70) return COLORS.pass;
  if (s >= 40) return COLORS.warn;
  return COLORS.fail;
}

function scoreVerdict(s: number): string {
  if (s >= 80) return "Excellent AI visibility";
  if (s >= 70) return "Good AI visibility";
  if (s >= 55) return "Moderate AI visibility";
  if (s >= 40) return "Needs improvement";
  return "Low AI visibility";
}

function priorityColor(p: Recommendation["priority"]): readonly [number, number, number] {
  if (p === "high") return COLORS.priorityHigh;
  if (p === "medium") return COLORS.priorityMed;
  return COLORS.priorityLow;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function statusGlyph(status: Finding["status"]): {
  char: string;
  color: readonly [number, number, number];
} {
  // Unicode-ish glyphs render reliably in Helvetica. Using plain ASCII
  // so there's no missing-glyph risk server-side.
  if (status === "pass") return { char: "\u2022", color: COLORS.pass }; // bullet (drawn large+filled-circle later)
  if (status === "warn") return { char: "\u2022", color: COLORS.warn };
  return { char: "\u2022", color: COLORS.fail };
}

// ── Drawing primitives ──────────────────────────────────────────────

/**
 * Chedder cheese-wedge mark. Yellow rounded square with darker dots,
 * sized to `size` in mm. Used on the cover and page headers.
 */
function drawCheeseMark(doc: jsPDF, x: number, y: number, size: number) {
  rgb(doc, COLORS.cheese, "fill");
  const radius = size * 0.18;
  doc.roundedRect(x, y, size, size, radius, radius, "F");
  // Darker dots to suggest cheese holes
  rgb(doc, COLORS.cheeseDeep, "fill");
  const r = size * 0.08;
  doc.circle(x + size * 0.33, y + size * 0.35, r, "F");
  doc.circle(x + size * 0.62, y + size * 0.3, r * 0.8, "F");
  doc.circle(x + size * 0.55, y + size * 0.62, r * 1.1, "F");
  doc.circle(x + size * 0.3, y + size * 0.65, r * 0.75, "F");
}

/**
 * "2pt" badge used in footers to subtly credit TPT.
 */
function drawTPTBadge(doc: jsPDF, x: number, y: number, size: number) {
  rgb(doc, COLORS.ink, "fill");
  doc.roundedRect(x, y, size, size, size * 0.2, size * 0.2, "F");
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(size * 1.8);
  rgb(doc, [255, 255, 255] as const, "text");
  doc.text("2pt", x + size / 2, y + size * 0.72, { align: "center" });
}

/**
 * Draw a pill-shaped tag with background + text. Returns total width
 * drawn so the caller can lay out siblings inline.
 */
function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  opts: {
    bg: readonly [number, number, number];
    text: readonly [number, number, number];
    fontSize?: number;
    padX?: number;
    padY?: number;
    bold?: boolean;
    uppercase?: boolean;
  }
): number {
  const fontSize = opts.fontSize ?? 8;
  const padX = opts.padX ?? 2.5;
  const padY = opts.padY ?? 1.4;
  doc.setFont("helvetica", opts.bold === false ? "normal" : "bold");
  doc.setFontSize(fontSize);
  const text = opts.uppercase === false ? label : label.toUpperCase();
  const textW = doc.getTextWidth(text);
  const w = textW + padX * 2;
  // Approx height from point size: 1pt ≈ 0.353mm; cap-height ~70% of em.
  const h = fontSize * 0.353 + padY * 2;
  rgb(doc, opts.bg, "fill");
  doc.roundedRect(x, y - h + padY * 1.3, w, h, h / 2, h / 2, "F");
  rgb(doc, opts.text, "text");
  doc.text(text, x + padX, y);
  return w;
}

/**
 * Chunky rounded progress bar. Used in the score-by-signal list.
 */
function drawScoreBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  score: number
) {
  rgb(doc, COLORS.hairline, "fill");
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  const filled = Math.max(h, w * Math.max(0, Math.min(1, score / 100)));
  rgb(doc, scoreColor(score), "fill");
  doc.roundedRect(x, y, filled, h, h / 2, h / 2, "F");
}

/**
 * Big solid score disc for the cover page. Colored fill, white score
 * in the middle, grade pill floating below.
 */
function drawScoreDisc(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  score: number,
  grade: string
) {
  const c = scoreColor(score);
  rgb(doc, c, "fill");
  doc.circle(cx, cy, radius, "F");

  // Score number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(radius * 1.9); // e.g. radius 18mm → ~34pt
  rgb(doc, [255, 255, 255] as const, "text");
  // jsPDF baseline is at the bottom of the text. Offset by ~28% of
  // the font size so the number looks optically centered.
  doc.text(String(score), cx, cy + radius * 0.3, { align: "center" });

  // Grade pill below the disc
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const gradeText = `Grade ${grade}`;
  const tw = doc.getTextWidth(gradeText);
  const pillW = tw + 10;
  const pillH = 6;
  const pillX = cx - pillW / 2;
  const pillY = cy + radius + 4;
  rgb(doc, COLORS.ink, "fill");
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "F");
  rgb(doc, [255, 255, 255] as const, "text");
  doc.text(gradeText, cx, pillY + pillH - 1.8, { align: "center" });
}

/**
 * Slim branded header strip on every non-cover page. Keeps brand
 * continuity and reinforces the document identity across prints.
 */
function drawPageHeader(doc: jsPDF, result: AuditResult) {
  rgb(doc, COLORS.ink, "draw");
  doc.setLineWidth(0.2);
  drawCheeseMark(doc, PAGE.margin, 10, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  rgb(doc, COLORS.ink, "text");
  doc.text("Chedder", PAGE.margin + 8, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rgb(doc, COLORS.subtle, "text");
  doc.text(
    `${result.domain} · ${scoreVerdict(result.overallScore)}`,
    PAGE.W - PAGE.margin,
    14,
    { align: "right" }
  );
  // Hairline under the header
  rgb(doc, COLORS.hairline, "draw");
  doc.setLineWidth(0.2);
  doc.line(PAGE.margin, 18.5, PAGE.W - PAGE.margin, 18.5);
}

/**
 * Section heading with tight letter-spacing and a small accent dot.
 */
function drawSectionHeading(doc: jsPDF, text: string, y: number) {
  rgb(doc, COLORS.cheese, "fill");
  doc.circle(PAGE.margin + 1.2, y - 1.6, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  rgb(doc, COLORS.ink, "text");
  doc.text(text, PAGE.margin + 5, y);
}

/**
 * Bottom footer on every page: TPT badge, doc title, page X of Y,
 * and the URL. Called in a second pass once total page count is known.
 */
function drawPageFooter(
  doc: jsPDF,
  pageIdx: number,
  total: number,
  result: AuditResult
) {
  const y = PAGE.H - 12;
  rgb(doc, COLORS.hairline, "draw");
  doc.setLineWidth(0.2);
  doc.line(PAGE.margin, y - 4, PAGE.W - PAGE.margin, y - 4);

  drawTPTBadge(doc, PAGE.margin, y - 4, 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  rgb(doc, COLORS.subtle, "text");
  doc.text(`Chedder audit · ${result.domain}`, PAGE.margin + 7, y);

  doc.text(`Page ${pageIdx} of ${total}`, PAGE.W / 2, y, { align: "center" });

  doc.text("chedder.2pt.ai", PAGE.W - PAGE.margin, y, { align: "right" });
}

/**
 * Ensure at least `need` mm of vertical space remains on the page; if
 * not, add a new page, draw the header, and return the new Y cursor.
 */
function ensureSpace(
  doc: jsPDF,
  y: number,
  need: number,
  result: AuditResult,
  topMargin = 26
): number {
  if (y + need <= PAGE.H - 16) return y;
  doc.addPage();
  drawPageHeader(doc, result);
  return topMargin;
}

// ── Writers ─────────────────────────────────────────────────────────

/**
 * Generate a short, honest executive summary from the data alone.
 * No fake confidence; reflects what the audit actually found.
 */
function writeExecutiveSummary(result: AuditResult): string[] {
  const lines: string[] = [];
  const weak = [...result.modules]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((m) => m.name.toLowerCase());
  const strong = [...result.modules]
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((m) => m.name.toLowerCase());
  const verdict = scoreVerdict(result.overallScore).toLowerCase();

  lines.push(
    `${result.domain} scored ${result.overallScore} out of 100 on ${formatDate(result.timestamp)}, which lands in the "${verdict}" band.`
  );
  if (strong.length > 0) {
    lines.push(
      `The brand's strongest signal right now is ${strong[0]}; the two biggest gaps are ${weak[0]}${weak[1] ? ` and ${weak[1]}` : ""}.`
    );
  }
  if (result.topRecommendations.length > 0) {
    const n = Math.min(result.topRecommendations.length, 3);
    lines.push(
      `The action plan on the next page lists ${result.topRecommendations.length} prioritized fixes; the top ${n} are where we'd start.`
    );
  }
  return lines;
}

// ── Main renderer ───────────────────────────────────────────────────

export function generateAuditPDF(result: AuditResult): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── Cover page ────────────────────────────────────────────────────
  // Full-bleed dark band across the top
  rgb(doc, COLORS.ink, "fill");
  doc.rect(0, 0, PAGE.W, 110, "F");

  // Cheese mark + wordmark
  drawCheeseMark(doc, PAGE.margin, 18, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  rgb(doc, [255, 255, 255] as const, "text");
  doc.text("Chedder", PAGE.margin + 16, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rgb(doc, COLORS.faint, "text");
  doc.text(
    "AI Search Visibility Audit",
    PAGE.margin + 16,
    31
  );

  // Date on the right
  doc.setFontSize(9);
  rgb(doc, COLORS.faint, "text");
  doc.text(
    `Run on ${formatDate(result.timestamp)}`,
    PAGE.W - PAGE.margin,
    26,
    { align: "right" }
  );
  if (result.slug) {
    doc.setFontSize(8);
    doc.text(`Audit ID: ${result.slug}`, PAGE.W - PAGE.margin, 31, {
      align: "right",
    });
  }

  // Domain (hero) in the dark band
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  rgb(doc, [255, 255, 255] as const, "text");
  const domainText = doc.splitTextToSize(result.domain, CONTENT_W - 50)[0];
  doc.text(domainText, PAGE.margin, 60);

  // URL below domain
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  rgb(doc, COLORS.faint, "text");
  const urlShort = result.url.length > 70 ? result.url.slice(0, 67) + "..." : result.url;
  doc.text(urlShort, PAGE.margin, 67);

  // Pages audited count
  if (result.pagesAudited?.length > 0) {
    doc.setFontSize(9);
    const pageLabel = `${result.pagesAudited.length} page${result.pagesAudited.length === 1 ? "" : "s"} audited`;
    doc.text(pageLabel, PAGE.margin, 73);
  }

  // Score disc in the bottom-right of the dark band, overlapping into light
  drawScoreDisc(doc, PAGE.W - PAGE.margin - 25, 80, 22, result.overallScore, result.grade);

  // Verdict banner below the dark band
  rgb(doc, COLORS.cream, "fill");
  doc.rect(0, 110, PAGE.W, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  rgb(doc, COLORS.cheese, "text");
  // Letter-spaced small caps for section label
  const verdictLabel = "OVERALL VERDICT";
  doc.setCharSpace(1.2);
  doc.text(verdictLabel, PAGE.margin, 121);
  doc.setCharSpace(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  rgb(doc, COLORS.ink, "text");
  doc.text(scoreVerdict(result.overallScore), PAGE.margin, 132);

  // Exec summary blurb on the cover (short)
  const summary = writeExecutiveSummary(result);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  rgb(doc, COLORS.subtle, "text");
  let ly = 158;
  for (const line of summary) {
    const wrapped = doc.splitTextToSize(line, CONTENT_W);
    doc.text(wrapped, PAGE.margin, ly);
    ly += wrapped.length * 5.2 + 2;
  }

  // KPI strip
  const kpiTop = 200;
  const kpiH = 38;
  const kpiW = (CONTENT_W - 6) / 3;
  const kpis: Array<{ label: string; value: string; sub?: string; accent: readonly [number, number, number] }> = [
    {
      label: "OVERALL SCORE",
      value: `${result.overallScore}/100`,
      sub: `Grade ${result.grade}`,
      accent: scoreColor(result.overallScore),
    },
    {
      label: "SIGNALS SCORED",
      value: String(result.modules.length),
      sub: `Across ${result.pagesAudited?.length || 1} page${(result.pagesAudited?.length || 1) === 1 ? "" : "s"}`,
      accent: COLORS.cheese,
    },
    {
      label: "RECOMMENDATIONS",
      value: String(result.topRecommendations.length),
      sub: `${result.topRecommendations.filter((r) => r.priority === "high").length} high priority`,
      accent: COLORS.priorityHigh,
    },
  ];
  kpis.forEach((k, i) => {
    const x = PAGE.margin + i * (kpiW + 3);
    // Card
    rgb(doc, [255, 255, 255] as const, "fill");
    doc.roundedRect(x, kpiTop, kpiW, kpiH, 2.5, 2.5, "F");
    rgb(doc, COLORS.hairline, "draw");
    doc.setLineWidth(0.3);
    doc.roundedRect(x, kpiTop, kpiW, kpiH, 2.5, 2.5, "S");
    // Accent stripe
    rgb(doc, k.accent, "fill");
    doc.rect(x, kpiTop, 1.2, kpiH, "F");
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    rgb(doc, COLORS.subtle, "text");
    doc.setCharSpace(0.8);
    doc.text(k.label, x + 5, kpiTop + 7);
    doc.setCharSpace(0);
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    rgb(doc, COLORS.ink, "text");
    doc.text(k.value, x + 5, kpiTop + 22);
    // Sub
    if (k.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      rgb(doc, COLORS.subtle, "text");
      doc.text(k.sub, x + 5, kpiTop + 30);
    }
  });

  // Cover footer (subtle, not numbered — the cover is page 1 but we
  // leave the numbered footer off so the hero feels uncluttered)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  rgb(doc, COLORS.subtle, "text");
  doc.text(
    "Prepared by Two Point Technologies · twopointtechnologies.com",
    PAGE.margin,
    PAGE.H - 15
  );
  doc.text("chedder.2pt.ai", PAGE.W - PAGE.margin, PAGE.H - 15, { align: "right" });

  // ── Page 2: Score breakdown ───────────────────────────────────────
  doc.addPage();
  drawPageHeader(doc, result);
  let y = 30;
  drawSectionHeading(doc, "Score by signal", y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  rgb(doc, COLORS.subtle, "text");
  const intro = doc.splitTextToSize(
    "Every module scores a specific signal AI tools use to decide which brands to recommend. Higher scores mean the signal is strong; lower scores are the biggest opportunities to move the needle.",
    CONTENT_W
  );
  doc.text(intro, PAGE.margin, y);
  y += intro.length * 4.5 + 6;

  for (const m of result.modules) {
    y = ensureSpace(doc, y, 22, result);
    // Module name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    rgb(doc, COLORS.ink, "text");
    doc.text(m.name, PAGE.margin, y);
    // Score pill on the right
    const c = scoreColor(m.score);
    const pillLabel = `${m.score}/100`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const pillW = doc.getTextWidth(pillLabel) + 6;
    const pillH = 5.5;
    const pillX = PAGE.W - PAGE.margin - pillW;
    const pillY = y - pillH + 1.5;
    rgb(doc, c, "fill");
    doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "F");
    rgb(doc, [255, 255, 255] as const, "text");
    doc.text(pillLabel, pillX + pillW / 2, y, { align: "center" });
    // One-line description
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(doc, COLORS.subtle, "text");
    const descLines = doc.splitTextToSize(m.description, CONTENT_W - 30);
    doc.text(descLines[0] || "", PAGE.margin, y);
    y += 3;
    // Chunky score bar
    drawScoreBar(doc, PAGE.margin, y, CONTENT_W, 4, m.score);
    y += 10;
  }

  // ── Page 3+: Action plan ──────────────────────────────────────────
  doc.addPage();
  drawPageHeader(doc, result);
  y = 30;
  drawSectionHeading(doc, "Action plan", y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  rgb(doc, COLORS.subtle, "text");
  const recIntro = doc.splitTextToSize(
    "Prioritized fixes from the audit. High priority items are the ones most likely to unlock AI visibility fast.",
    CONTENT_W
  );
  doc.text(recIntro, PAGE.margin, y);
  y += recIntro.length * 4.5 + 6;

  for (let i = 0; i < result.topRecommendations.length; i++) {
    const rec = result.topRecommendations[i];
    const pc = priorityColor(rec.priority);

    // Estimate height so we don't split mid-card
    doc.setFontSize(10.5);
    const titleLines = doc.splitTextToSize(rec.title, CONTENT_W - 24);
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(rec.description, CONTENT_W - 14);
    const cardH = 10 + titleLines.length * 5.4 + descLines.length * 4.6 + 6;

    y = ensureSpace(doc, y, cardH + 4, result);

    // Card background
    rgb(doc, [250, 250, 247] as const, "fill");
    doc.roundedRect(PAGE.margin, y, CONTENT_W, cardH, 3, 3, "F");
    rgb(doc, COLORS.hairline, "draw");
    doc.setLineWidth(0.3);
    doc.roundedRect(PAGE.margin, y, CONTENT_W, cardH, 3, 3, "S");
    // Priority accent stripe on the left edge
    rgb(doc, pc, "fill");
    doc.rect(PAGE.margin, y, 1.4, cardH, "F");

    // Top row: "01" number + priority pill
    const pad = 6;
    const rowY = y + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    rgb(doc, COLORS.faint, "text");
    const numLabel = String(i + 1).padStart(2, "0");
    doc.text(numLabel, PAGE.margin + pad, rowY);
    const numW = doc.getTextWidth(numLabel) + 3;

    drawPill(doc, PAGE.margin + pad + numW, rowY, rec.priority, {
      bg: [pc[0], pc[1], pc[2]] as const,
      text: [255, 255, 255] as const,
      fontSize: 7,
      padX: 3,
      padY: 1.1,
    });

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    rgb(doc, COLORS.ink, "text");
    doc.text(titleLines, PAGE.margin + pad, rowY + 6);

    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    rgb(doc, COLORS.subtle, "text");
    doc.text(descLines, PAGE.margin + pad, rowY + 6 + titleLines.length * 5.4 + 2);

    y += cardH + 4;
  }

  // ── Competitor section (if we have AI competitors) ────────────────
  if (result.aiCompetitors && result.aiCompetitors.length > 0) {
    doc.addPage();
    drawPageHeader(doc, result);
    y = 30;
    drawSectionHeading(doc, "Who AI names in your category", y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    rgb(doc, COLORS.subtle, "text");
    const cIntro = doc.splitTextToSize(
      "Brands that came up when we asked AI tools category-relevant questions. Frequency is how many of the probe queries mentioned each brand.",
      CONTENT_W
    );
    doc.text(cIntro, PAGE.margin, y);
    y += cIntro.length * 4.5 + 6;

    const competitors = result.aiCompetitors.slice(0, 12);
    const maxMentions = Math.max(...competitors.map((c) => c.mentions), 1);
    for (const comp of competitors) {
      y = ensureSpace(doc, y, 14, result);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      rgb(doc, COLORS.ink, "text");
      doc.text(comp.domain, PAGE.margin, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      rgb(doc, COLORS.subtle, "text");
      doc.text(
        `${comp.mentions} mention${comp.mentions === 1 ? "" : "s"}`,
        PAGE.W - PAGE.margin,
        y,
        { align: "right" }
      );

      // Relative bar based on mention count
      y += 2.5;
      rgb(doc, COLORS.hairline, "fill");
      doc.roundedRect(PAGE.margin, y, CONTENT_W, 2.2, 1.1, 1.1, "F");
      rgb(doc, COLORS.cheeseDeep, "fill");
      const w = CONTENT_W * (comp.mentions / maxMentions);
      doc.roundedRect(PAGE.margin, y, Math.max(2, w), 2.2, 1.1, 1.1, "F");
      y += 8;
    }
  }

  // ── Detailed findings per module ──────────────────────────────────
  for (const m of result.modules) {
    doc.addPage();
    drawPageHeader(doc, result);
    y = 30;
    renderModuleDetail(doc, result, m, y);
  }

  // ── Second pass: page numbers ─────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // Skip cover page (p=1)
    if (p === 1) continue;
    drawPageFooter(doc, p, total, result);
  }

  return doc;
}

/**
 * Render a single module's detailed findings page.
 */
function renderModuleDetail(
  doc: jsPDF,
  result: AuditResult,
  m: ModuleResult,
  startY: number
) {
  let y = startY;

  // Module title + score pill
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  rgb(doc, COLORS.ink, "text");
  doc.text(m.name, PAGE.margin, y);

  const c = scoreColor(m.score);
  const pillLabel = `${m.score}/100`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const pillW = doc.getTextWidth(pillLabel) + 8;
  const pillH = 7;
  const pillX = PAGE.W - PAGE.margin - pillW;
  const pillY = y - pillH + 2;
  rgb(doc, c, "fill");
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "F");
  rgb(doc, [255, 255, 255] as const, "text");
  doc.text(pillLabel, pillX + pillW / 2, y, { align: "center" });

  y += 5;
  // Description
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  rgb(doc, COLORS.subtle, "text");
  const descLines = doc.splitTextToSize(m.description, CONTENT_W);
  doc.text(descLines, PAGE.margin, y);
  y += descLines.length * 4.6 + 6;

  // Findings subheading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  rgb(doc, COLORS.subtle, "text");
  doc.setCharSpace(1);
  doc.text("FINDINGS", PAGE.margin, y);
  doc.setCharSpace(0);
  y += 5;

  for (const f of m.findings) {
    // Estimate height (label + detail wrapped)
    doc.setFontSize(10);
    const detailLines = doc.splitTextToSize(f.detail || "", CONTENT_W - 8);
    const need = 6 + detailLines.length * 4.2 + 3;
    y = ensureSpace(doc, y, need, result);

    const g = statusGlyph(f.status);
    // Filled dot
    rgb(doc, g.color, "fill");
    doc.circle(PAGE.margin + 1.8, y - 1.8, 1.4, "F");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    rgb(doc, COLORS.ink, "text");
    doc.text(f.label, PAGE.margin + 6, y);

    // Detail on next line(s)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    rgb(doc, COLORS.subtle, "text");
    y += 4.2;
    doc.text(detailLines, PAGE.margin + 6, y);
    y += detailLines.length * 4.2 + 3.5;

    // Quote excerpt (if present)
    if (f.excerpt) {
      const exLines = doc.splitTextToSize(f.excerpt, CONTENT_W - 16);
      const exH = exLines.length * 4.2 + 5;
      y = ensureSpace(doc, y, exH + 3, result);
      rgb(doc, COLORS.cream, "fill");
      doc.roundedRect(PAGE.margin + 6, y - 2.5, CONTENT_W - 6, exH, 2, 2, "F");
      rgb(doc, COLORS.cheese, "fill");
      doc.rect(PAGE.margin + 6, y - 2.5, 1.2, exH, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      rgb(doc, COLORS.ink, "text");
      doc.text(exLines, PAGE.margin + 10, y + 1);
      y += exH + 2;
    }

    y += 2;
  }

  // Module-specific recommendations, if any
  if (m.recommendations && m.recommendations.length > 0) {
    y = ensureSpace(doc, y, 14, result);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    rgb(doc, COLORS.subtle, "text");
    doc.setCharSpace(1);
    doc.text("RECOMMENDED NEXT STEPS", PAGE.margin, y);
    doc.setCharSpace(0);
    y += 5;

    for (const rec of m.recommendations) {
      const pc = priorityColor(rec.priority);
      doc.setFontSize(10);
      const rLines = doc.splitTextToSize(rec.title, CONTENT_W - 8);
      const need = 5 + rLines.length * 4.4;
      y = ensureSpace(doc, y, need + 2, result);

      // Priority dot
      rgb(doc, pc, "fill");
      doc.circle(PAGE.margin + 1.8, y - 1.8, 1.4, "F");
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      rgb(doc, COLORS.ink, "text");
      doc.text(rLines, PAGE.margin + 6, y);
      y += rLines.length * 4.4 + 3;
    }
  }
}
