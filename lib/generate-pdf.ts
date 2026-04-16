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

export function generateAuditPDF(result: AuditResult): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 20;

  // ── Header ────────────────────────────────────────────────────
  doc.setFillColor(29, 29, 31);
  doc.rect(0, 0, W, 50, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text("Chedder GEO Audit", margin, 22);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text(result.domain, margin, 32);
  doc.text(result.url, margin, 39);

  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`${result.overallScore}`, W - margin, 30, { align: "right" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${result.grade}. ${scoreLabel(result.overallScore)}`, W - margin, 40, { align: "right" });

  y = 60;

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
  doc.rect(0, pageH - 20, W, 20, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Chedder GEO Audit", margin, pageH - 8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Made by Two Point Technologies, twopointtechnologies.com", W - margin, pageH - 8, { align: "right" });

  return doc;
}
