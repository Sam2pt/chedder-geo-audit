import jsPDF from "jspdf";
import { AuditResult } from "./types";

function scoreLabel(s: number) {
  if (s >= 70) return "Good AI Visibility";
  if (s >= 40) return "Needs Improvement";
  return "Low AI Visibility";
}

function scoreHex(s: number) {
  if (s >= 70) return "#34c759";
  if (s >= 40) return "#ff9f0a";
  return "#ff453a";
}

/**
 * Draw the 2pt logo (black rounded square with white italic "2pt").
 * x, y = top-left in mm. size = side length in mm.
 */
function draw2ptLogo(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(29, 29, 31);
  doc.roundedRect(x, y, size, size, size * 0.15, size * 0.15, "F");
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(size * 2);
  doc.setTextColor(255, 255, 255);
  // Approximate vertical centering
  doc.text("2pt", x + size / 2, y + size * 0.72, { align: "center" });
}

export function generateAuditPDF(result: AuditResult): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 20;

  // ── Header ────────────────────────────────────────────────────
  doc.setFillColor(29, 29, 31);
  doc.rect(0, 0, W, 55, "F");

  // 2pt logo top-left
  draw2ptLogo(doc, margin, 12, 10);

  // Title next to logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Chedder GEO Audit", margin + 14, 19);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Generative Engine Optimization", margin + 14, 24);

  // Domain section below
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(result.domain, margin, 38);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text(result.url, margin, 44);

  // Score right side
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`${result.overallScore}`, W - margin, 30, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(`${result.grade} · ${scoreLabel(result.overallScore)}`, W - margin, 40, { align: "right" });

  y = 65;

  // ── Score Breakdown ───────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(29, 29, 31);
  doc.text("Score Breakdown", margin, y);
  y += 8;

  for (const m of result.modules) {
    const color = scoreHex(m.score);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(29, 29, 31);
    doc.text(m.name, margin, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(r, g, b);
    doc.text(`${m.score}`, W - margin, y, { align: "right" });

    // Bar background
    const barY = y + 2;
    doc.setFillColor(240, 240, 242);
    doc.roundedRect(margin, barY, contentW, 3, 1.5, 1.5, "F");

    // Bar fill
    doc.setFillColor(r, g, b);
    doc.roundedRect(margin, barY, contentW * (m.score / 100), 3, 1.5, 1.5, "F");

    y += 12;
  }

  y += 5;

  // ── Top Recommendations ───────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(29, 29, 31);
  doc.text("Top Recommendations", margin, y);
  y += 8;

  for (let i = 0; i < result.topRecommendations.length; i++) {
    const rec = result.topRecommendations[i];

    if (y > 265) {
      doc.addPage();
      y = 20;
    }

    // Priority color
    const pColor = rec.priority === "high" ? "#ff453a" : rec.priority === "medium" ? "#ff9f0a" : "#007aff";
    const pr = parseInt(pColor.slice(1, 3), 16);
    const pg = parseInt(pColor.slice(3, 5), 16);
    const pb = parseInt(pColor.slice(5, 7), 16);

    // Number
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 180, 180);
    doc.text(`${i + 1}`, margin, y);

    // Priority tag
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(pr, pg, pb);
    doc.text(rec.priority.toUpperCase(), margin + 8, y);

    // Title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(29, 29, 31);
    doc.text(rec.title, margin + 28, y);
    y += 5;

    // Description
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 125);
    const lines = doc.splitTextToSize(rec.description, contentW - 28);
    doc.text(lines, margin + 28, y);
    y += lines.length * 4 + 5;
  }

  // ── Detailed Findings ─────────────────────────────────────────
  for (const m of result.modules) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(29, 29, 31);
    doc.text(`${m.name}. ${m.score}/100`, margin, y);
    y += 3;

    // Color bar
    const color = scoreHex(m.score);
    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(margin, y, contentW * (m.score / 100), 2, 1, 1, "F");
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(140, 140, 145);
    doc.text("FINDINGS", margin, y);
    y += 5;

    for (const f of m.findings) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const statusSymbol = f.status === "pass" ? "+" : f.status === "warn" ? "~" : "x";
      const sColor = f.status === "pass" ? "#34c759" : f.status === "warn" ? "#ff9f0a" : "#ff453a";
      const sr = parseInt(sColor.slice(1, 3), 16);
      const sg = parseInt(sColor.slice(3, 5), 16);
      const sb = parseInt(sColor.slice(5, 7), 16);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(sr, sg, sb);
      doc.text(statusSymbol, margin, y);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(29, 29, 31);
      doc.text(f.label, margin + 6, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 125);
      const detailLines = doc.splitTextToSize(f.detail, contentW - 50);
      doc.text(`. ${detailLines[0]}`, margin + 6 + doc.getTextWidth(f.label), y);
      if (detailLines.length > 1) {
        y += 4;
        doc.text(detailLines.slice(1), margin + 6, y);
        y += (detailLines.length - 1) * 4;
      }
      y += 5;
    }

    y += 3;
  }

  // ── Footer on last page ───────────────────────────────────────
  const pageH = 297;
  doc.setFillColor(29, 29, 31);
  doc.rect(0, pageH - 22, W, 22, "F");

  // 2pt logo in footer
  draw2ptLogo(doc, margin, pageH - 18, 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Chedder GEO Audit", margin + 12, pageH - 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(170, 170, 170);
  doc.text("Made by Two Point Technologies", margin + 12, pageH - 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text("twopointtechnologies.com", W - margin, pageH - 10, { align: "right" });

  return doc;
}
