"use client";

import { useState } from "react";
import { AuditResult, ModuleResult, Finding, Recommendation } from "@/lib/types";
import { generateAuditPDF } from "@/lib/generate-pdf";

/* ── Module color palette ────────────────────────────────────────── */

const MODULE_COLORS: Record<string, { accent: string; light: string; dark: string }> = {
  schema:    { accent: "#6366f1", light: "rgba(99,102,241,0.08)",  dark: "#4f46e5" },
  meta:      { accent: "#0ea5e9", light: "rgba(14,165,233,0.08)",  dark: "#0284c7" },
  content:   { accent: "#8b5cf6", light: "rgba(139,92,246,0.08)",  dark: "#7c3aed" },
  technical: { accent: "#f59e0b", light: "rgba(245,158,11,0.08)",  dark: "#d97706" },
  authority: { accent: "#10b981", light: "rgba(16,185,129,0.08)",  dark: "#059669" },
  external:  { accent: "#ec4899", light: "rgba(236,72,153,0.08)",  dark: "#db2777" },
  "ai-citations": { accent: "#14b8a6", light: "rgba(20,184,166,0.08)", dark: "#0d9488" },
};

function moduleColor(slug: string) {
  return MODULE_COLORS[slug] || MODULE_COLORS.schema;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function scoreColor(s: number) {
  if (s >= 70) return { bg: "#34c759", bgLight: "rgba(52,199,89,0.08)", text: "#248a3d" };
  if (s >= 40) return { bg: "#ff9f0a", bgLight: "rgba(255,159,10,0.08)", text: "#c77c02" };
  return { bg: "#ff453a", bgLight: "rgba(255,69,58,0.08)", text: "#d70015" };
}

function gradeLabel(s: number) {
  if (s >= 70) return "Good AI Visibility";
  if (s >= 40) return "Needs Improvement";
  return "Low AI Visibility";
}

/* ── Score Gauge ──────────────────────────────────────────────────── */

function ScoreGauge({
  score,
  variant = "light",
}: {
  score: number;
  variant?: "light" | "dark";
}) {
  const c = scoreColor(score);
  const radius = 80;
  const stroke = 10;
  const nr = radius - stroke;
  const circ = 2 * Math.PI * nr;
  const arcLen = circ * 0.75;
  const offset = arcLen - (score / 100) * arcLen;

  const isDark = variant === "dark";
  const trackStroke = isDark ? "#ffffff" : "#1d1d1f";
  const trackOpacity = isDark ? 0.14 : 0.06;
  const numberColor = isDark ? "text-white" : "text-foreground";
  const subColor = isDark ? "text-white/60" : "text-muted-foreground";

  return (
    <div className="relative inline-flex items-center justify-center w-[200px] h-[200px]">
      <div className="absolute inset-4 rounded-full pulse-glow" style={{ background: `radial-gradient(circle, ${c.bg}20 0%, transparent 70%)` }} />
      <svg width={200} height={200} className="rotate-[135deg]">
        <circle cx={100} cy={100} r={nr} fill="none" stroke={trackStroke} strokeOpacity={trackOpacity} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${arcLen} ${circ}`} />
        <circle cx={100} cy={100} r={nr} fill="none" stroke={c.bg} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${arcLen} ${circ}`} strokeDashoffset={offset} className="transition-all duration-[1.2s] ease-out" style={{ filter: `drop-shadow(0 0 8px ${c.bg}70)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className={`text-[52px] font-semibold tracking-[-0.04em] leading-none ${numberColor}`}>{score}</span>
        <span className={`text-[13px] mt-1 ${subColor}`}>out of 100</span>
      </div>
    </div>
  );
}

/* ── Score Bar ────────────────────────────────────────────────────── */

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium text-foreground tracking-[-0.01em]">{label}</span>
        <span className="text-[14px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color }}>
          {score}
        </span>
      </div>
      <div className="h-[6px] rounded-full bg-foreground/[0.04] overflow-hidden">
        <div className="h-full rounded-full animate-bar" style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
    </div>
  );
}

/* ── Status Icon ──────────────────────────────────────────────────── */

function StatusIcon({ status }: { status: Finding["status"] }) {
  if (status === "pass")
    return (
      <div className="w-[18px] h-[18px] rounded-full bg-[#34c759]/10 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#248a3d]">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  if (status === "warn")
    return (
      <div className="w-[18px] h-[18px] rounded-full bg-[#ff9f0a]/10 flex items-center justify-center shrink-0">
        <div className="w-[6px] h-[6px] rounded-full bg-[#c77c02]" />
      </div>
    );
  return (
    <div className="w-[18px] h-[18px] rounded-full bg-[#ff453a]/10 flex items-center justify-center shrink-0">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-[#d70015]">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

/* ── Priority Tag ────────────────────────────────────────────────── */

function PriorityTag({ priority }: { priority: Recommendation["priority"] }) {
  const styles: Record<string, { bg: string; text: string }> = {
    high: { bg: "bg-[#ff453a]/8", text: "text-[#d70015]" },
    medium: { bg: "bg-[#ff9f0a]/8", text: "text-[#c77c02]" },
    low: { bg: "bg-[#007aff]/8", text: "text-[#0055b3]" },
  };
  const s = styles[priority];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md uppercase tracking-[0.04em] ${s.bg} ${s.text}`}>
      {priority}
    </span>
  );
}

/* ── Module Card ──────────────────────────────────────────────────── */

function ModuleCard({ module }: { module: ModuleResult }) {
  const [open, setOpen] = useState(false);
  const mc = moduleColor(module.slug);

  return (
    <div className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Color accent bar */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${mc.accent}60, ${mc.accent})` }} />

      <button
        className="w-full text-left px-5 py-[18px] flex items-center justify-between gap-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-2 h-8 rounded-full shrink-0" style={{ background: mc.accent }} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-foreground tracking-[-0.01em] truncate">{module.name}</div>
            <div className="text-[13px] text-muted-foreground truncate leading-snug">{module.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: mc.accent }}>
            {module.score}
          </span>
          <svg
            className={`w-4 h-4 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          <div className="h-px bg-black/[0.04]" />

          <div className="h-[5px] rounded-full bg-foreground/[0.04] overflow-hidden">
            <div className="h-full rounded-full animate-bar" style={{ width: `${module.score}%`, background: `linear-gradient(90deg, ${mc.accent}70, ${mc.accent})` }} />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 mb-3">Findings</div>
            <div className="space-y-2.5">
              {module.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <StatusIcon status={f.status} />
                  <div className="text-[13px] leading-[1.5] tracking-[-0.005em]">
                    <span className="font-medium text-foreground">{f.label}</span>
                    <span className="text-muted-foreground">: {f.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {module.recommendations.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 mb-3">Recommendations</div>
              <div className="space-y-2">
                {module.recommendations.map((r, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-black/[0.03] space-y-1.5" style={{ background: mc.light }}>
                    <div className="flex items-center gap-2">
                      <PriorityTag priority={r.priority} />
                      <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">{r.title}</span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-[1.55] tracking-[-0.005em]">{r.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chat-style floating action popup ────────────────────────────── */

type ChatMode = "intro" | "done";

function ChatPopup({ result }: { result: AuditResult }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("intro");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);

  async function submitPDF() {
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    const lead = {
      name, email,
      website: result.domain,
      message: `PDF download requested. Company: ${company || "N/A"}`,
      score: result.overallScore,
      source: "pdf-download" as const,
      company,
    };
    await Promise.allSettled([
      (async () => {
        const fd = new URLSearchParams();
        fd.append("form-name", "pdf-download");
        fd.append("name", name);
        fd.append("email", email);
        fd.append("company", company);
        fd.append("website", result.domain);
        fd.append("score", String(result.overallScore));
        await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fd.toString() });
      })(),
      fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) }),
    ]);
    const doc = generateAuditPDF(result);
    doc.save(`${result.domain}-geo-audit.pdf`);
    setSending(false);
    setMode("done");
  }

  function reset() {
    setMode("intro");
    setName("");
    setEmail("");
    setCompany("");
  }

  // Icons
  const cheeseIcon = (
    <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="45" fill="#FFB800"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#E5A500" strokeWidth="3"/>
      <circle cx="35" cy="35" r="4" fill="#E5A500" opacity="0.6"/>
      <circle cx="65" cy="40" r="3" fill="#E5A500" opacity="0.6"/>
      <circle cx="55" cy="60" r="5" fill="#E5A500" opacity="0.6"/>
      <circle cx="35" cy="65" r="3" fill="#E5A500" opacity="0.6"/>
    </svg>
  );

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 h-14 px-5 rounded-full bg-[#1d1d1f] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:shadow-[0_10px_32px_rgba(0,0,0,0.22)] transition-all active:scale-[0.97] flex items-center gap-2.5 font-semibold text-[14px] tracking-[-0.01em]"
        >
          {cheeseIcon}
          Download full report
        </button>
      )}

      {/* Backdrop (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0" onClick={() => { setOpen(false); reset(); }} />
      )}

      {/* Popup */}
      {open && (
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto sm:bottom-6 sm:right-6 z-50 sm:w-[380px] rounded-3xl bg-white shadow-[0_12px_48px_rgba(0,0,0,0.16)] border border-black/[0.06] overflow-hidden flex flex-col max-h-[calc(100vh-60px)]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-black/[0.04]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#FFB800]/20 flex items-center justify-center">
                {cheeseIcon}
              </div>
              <div>
                <div className="text-[14px] font-semibold tracking-[-0.01em]">Chedder</div>
                <div className="text-[11px] text-muted-foreground">by Two Point Technologies</div>
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); reset(); }}
              className="w-8 h-8 rounded-lg hover:bg-black/[0.04] transition-colors flex items-center justify-center text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Greeting bubble */}
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#FFB800]/20 flex items-center justify-center shrink-0 mt-0.5">
                {cheeseIcon}
              </div>
              <div className="flex-1">
                <div className="inline-block max-w-full p-3 rounded-2xl rounded-tl-md bg-[#f5f5f7] text-[13px] leading-[1.55] text-foreground">
                  {mode === "intro" && <>Want the full audit for <strong>{result.domain}</strong> as a PDF? Pop your details in and I&apos;ll send it over.</>}
                  {mode === "done" && <>Done 🎉 Check your downloads folder for <strong>{result.domain}-geo-audit.pdf</strong>. We&apos;ve saved your details so we can reach out if helpful.</>}
                </div>
              </div>
            </div>

            {/* PDF form */}
            {mode === "intro" && (
              <form
                onSubmit={(e) => { e.preventDefault(); submitPDF(); }}
                className="space-y-2 pl-9"
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-[#f5f5f7] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Work email"
                  required
                  className="w-full h-10 px-3.5 rounded-xl bg-[#f5f5f7] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company (optional)"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#f5f5f7] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <button
                  type="submit"
                  disabled={sending || !name.trim() || !email.trim()}
                  className="w-full h-10 rounded-xl bg-[#1d1d1f] text-white text-[13px] font-semibold hover:bg-[#1d1d1f]/85 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2 mt-1"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                  {sending ? "Generating..." : "Send me the PDF"}
                </button>
              </form>
            )}

            {/* Done state */}
            {mode === "done" && (
              <div className="pl-9">
                <button
                  onClick={() => { setOpen(false); reset(); }}
                  className="w-full h-10 rounded-xl bg-[#1d1d1f] text-white text-[13px] font-semibold hover:bg-[#1d1d1f]/85 active:scale-[0.99] transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Powered by footer */}
          <a
            href="https://twopointtechnologies.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 border-t border-black/[0.04] hover:bg-black/[0.01] transition-colors"
          >
            <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-4 rounded" />
            <span className="text-[11px] text-muted-foreground/50 font-medium">
              Powered by Two Point Technologies
            </span>
          </a>
        </div>
      )}
    </>
  );
}

/* ── Gated PDF Download (kept for potential fallback) ────────────── */

function DownloadGate({ result }: { result: AuditResult }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setState("sending");

    // Submit to BOTH Netlify Forms AND our own API (belt and suspenders)
    // Our API endpoint also sends email as a backup.
    const lead = {
      name,
      email,
      website: result.domain,
      message: `PDF download requested. Company: ${company || "N/A"}`,
      score: result.overallScore,
      source: "pdf-download",
    };

    await Promise.allSettled([
      // Netlify Forms submission
      (async () => {
        const formData = new URLSearchParams();
        formData.append("form-name", "pdf-download");
        formData.append("name", name);
        formData.append("email", email);
        formData.append("company", company);
        formData.append("website", result.domain);
        formData.append("score", String(result.overallScore));
        await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
      })(),
      // Backup: hit our own API (which emails via backend + logs)
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      }),
    ]);

    // Generate and download PDF
    const doc = generateAuditPDF(result);
    doc.save(`${result.domain}-geo-audit.pdf`);
    setState("done");
  }

  if (state === "done") {
    return (
      <section>
        <div className="p-6 rounded-2xl bg-[#f5f5f7] border border-black/[0.04] text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#34c759]/10 flex items-center justify-center mx-auto">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#34c759]">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-foreground">PDF downloaded</p>
          <p className="text-[13px] text-muted-foreground">Check your downloads folder for <strong>{result.domain}-geo-audit.pdf</strong></p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="p-6 rounded-2xl bg-[#f5f5f7] border border-black/[0.04] space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/60" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
              <path d="M12 18v-6"/>
              <path d="m9 15 3 3 3-3"/>
            </svg>
          </div>
          <div>
            <h3 className="text-[16px] font-semibold tracking-[-0.02em]">Download Full Audit Report</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Get a PDF with all scores, findings, and recommendations you can share with your team.</p>
          </div>
        </div>

        <form name="pdf-download" onSubmit={handleDownload} className="space-y-3" data-netlify="true" netlify-honeypot="bot-field">
          <input type="hidden" name="form-name" value="pdf-download" />
          <input type="hidden" name="website" value={result.domain} />
          <input type="hidden" name="score" value={result.overallScore} />
          <p className="hidden"><label>Don&apos;t fill this out: <input name="bot-field" /></label></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="h-10 px-3.5 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-all"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work email"
              required
              className="h-10 px-3.5 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-all"
            />
          </div>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company name (optional)"
            className="w-full h-10 px-3.5 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-all"
          />
          <button
            type="submit"
            disabled={state === "sending" || !name.trim() || !email.trim()}
            className="w-full h-10 rounded-xl bg-[#1d1d1f] text-white text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:bg-[#1d1d1f]/85 active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <path d="M7 10l5 5 5-5"/>
              <path d="M12 15V3"/>
            </svg>
            {state === "sending" ? "Generating..." : "Download PDF Report"}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ── Contact Form ────────────────────────────────────────────────── */

function ContactCTA({ website, score }: { website: string; score: number }) {
  const [formState, setFormState] = useState<"idle" | "sending" | "sent">("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setFormState("sending");
    try {
      const formData = new URLSearchParams();
      formData.append("form-name", "contact");
      formData.append("name", name);
      formData.append("email", email);
      formData.append("website", website);
      formData.append("message", message);
      formData.append("score", String(score));
      await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      setFormState("sent");
    } catch {
      setFormState("sent");
    }
  }

  if (formState === "sent") {
    return (
      <section className="space-y-4">
        <div className="p-8 rounded-2xl bg-gradient-to-br from-[#6366f1]/[0.06] via-[#0ea5e9]/[0.04] to-[#10b981]/[0.06] border border-black/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#34c759]/10 flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#34c759]">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3 className="text-[18px] font-semibold tracking-[-0.02em]">We{"'"}ll be in touch</h3>
          <p className="text-[14px] text-muted-foreground">Our team will review your audit and reach out with a personalized GEO strategy.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#6366f1]/[0.06] via-[#0ea5e9]/[0.04] to-[#10b981]/[0.06] border border-black/[0.06] space-y-5">
        <div className="space-y-2">
          <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Want expert help improving your score?</h3>
          <p className="text-[14px] text-muted-foreground leading-[1.6]">
            Our GEO specialists can implement these recommendations and build a comprehensive AI visibility strategy for your brand.
          </p>
        </div>

        <form name="contact" onSubmit={handleSubmit} className="space-y-3" data-netlify="true" netlify-honeypot="bot-field">
          <input type="hidden" name="form-name" value="contact" />
          <input type="hidden" name="website" value={website} />
          <input type="hidden" name="score" value={score} />
          <p className="hidden"><label>Don&apos;t fill this out: <input name="bot-field" /></label></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="h-11 px-4 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[#6366f1]/30 focus:ring-1 focus:ring-[#6366f1]/20 transition-all"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="h-11 px-4 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[#6366f1]/30 focus:ring-1 focus:ring-[#6366f1]/20 transition-all"
            />
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your goals (optional)"
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[#6366f1]/30 focus:ring-1 focus:ring-[#6366f1]/20 transition-all resize-none"
          />
          <button
            type="submit"
            disabled={formState === "sending" || !name.trim() || !email.trim()}
            className="w-full h-11 rounded-xl bg-[#1d1d1f] text-white text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:bg-[#1d1d1f]/85 active:scale-[0.99] disabled:opacity-40"
          >
            {formState === "sending" ? "Sending..." : "Get a Free GEO Strategy Call"}
          </button>
          <a href="https://twopointtechnologies.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 group">
            <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-5 rounded transition-opacity group-hover:opacity-80" />
            <span className="text-[11px] text-muted-foreground/40 group-hover:text-muted-foreground transition-colors font-medium">
              Powered by Two Point Technologies
            </span>
          </a>
        </form>
      </div>
    </section>
  );
}

/* ── Executive Summary ───────────────────────────────────────────── */

function ExecutiveSummary({ result }: { result: AuditResult }) {
  const sortedModules = [...result.modules].sort((a, b) => a.score - b.score);
  const weakest = sortedModules[0];
  const strongest = sortedModules[sortedModules.length - 1];

  const allRecs = result.modules.flatMap((m) => m.recommendations);
  const highCount = allRecs.filter((r) => r.priority === "high").length;

  const aiModule = result.modules.find((m) => m.slug === "ai-citations");
  const aiData = aiModule
    ? {
        score: aiModule.score,
        mentionRate: aiModule.findings.filter(
          (f) => f.status === "pass" || f.status === "warn"
        ).length,
        totalQueries: aiModule.findings.filter(
          (f) => !f.label.toLowerCase().includes("spend")
        ).length,
      }
    : null;

  let verdict = "";
  let interpretation = "";
  const s = result.overallScore;
  if (s >= 80) {
    verdict = "Your brand is well-positioned for AI search.";
    interpretation = `${result.domain} shows strong signals across the board. AI models have good reason to cite you.`;
  } else if (s >= 60) {
    verdict = "Your brand has a foundation, but there's meaningful work to do.";
    interpretation = `${result.domain} hits the basics but leaves significant opportunity on the table. ${highCount} high-priority items need attention.`;
  } else if (s >= 40) {
    verdict = "Your brand is underperforming for AI visibility.";
    interpretation = `${result.domain} has structural gaps preventing AI from recommending you. Expect to be invisible in most AI answers until these are fixed.`;
  } else {
    verdict = "Your brand is largely invisible to AI.";
    interpretation = `${result.domain} scores below the threshold where AI builds confidence. Competitors are being recommended instead. This is urgent.`;
  }

  return (
    <section>
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#1d1d1f] to-[#2d2d30] text-white">
        {/* Top row: gauge + verdict */}
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
          <div className="shrink-0 mx-auto sm:mx-0">
            <ScoreGauge score={result.overallScore} variant="dark" />
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50 mb-1.5">
                {result.domain}
              </div>
              <p className="text-[20px] sm:text-[24px] font-semibold leading-[1.3] tracking-[-0.02em]">
                {verdict}
              </p>
            </div>
            <p className="text-[14px] text-white/60 leading-[1.55]">
              {interpretation}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Grade</div>
                <div className="text-[15px] font-semibold">{result.grade} <span className="text-white/40 font-normal text-[12px]">{gradeLabel(result.overallScore)}</span></div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Strongest</div>
                <div className="text-[14px] font-semibold leading-snug">{strongest.name.split(" ")[0]} <span className="text-white/40 font-normal">{strongest.score}</span></div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Weakest</div>
                <div className="text-[14px] font-semibold leading-snug">{weakest.name.split(" ")[0]} <span className="text-white/40 font-normal">{weakest.score}</span></div>
              </div>
            </div>
          </div>
        </div>

        {aiData && (
          <div className="mt-5 p-4 rounded-2xl bg-white/[0.06] border border-white/[0.08]">
            <div className="flex items-start gap-3">
              <span className="text-[18px]">🤖</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-white/90 mb-0.5">
                  Live AI test
                </div>
                <p className="text-[13px] text-white/60 leading-[1.55]">
                  {aiData.score >= 70
                    ? `Perplexity mentioned your brand in ${aiData.mentionRate} of ${aiData.totalQueries} queries. You're showing up.`
                    : aiData.score >= 40
                      ? `Perplexity mentioned your brand in ${aiData.mentionRate} of ${aiData.totalQueries} queries, but rarely prominently. Competitors are being recommended first.`
                      : `Perplexity mentioned your brand in only ${aiData.mentionRate} of ${aiData.totalQueries} queries. You are functionally invisible to AI search.`}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Where You Show Up / Where You Don't ─────────────────────────── */

function WhereResults({ result }: { result: AuditResult }) {
  const aiModule = result.modules.find((m) => m.slug === "ai-citations");

  // Parse AI findings into show-up vs don't-show-up lists
  const aiFindings = aiModule?.findings.filter(
    (f) => !f.label.toLowerCase().includes("spend") && !f.label.toLowerCase().includes("query failed")
  ) || [];

  const showsUp = aiFindings.filter((f) => f.status === "pass");
  const showsUpButWeak = aiFindings.filter((f) => f.status === "warn");
  const invisible = aiFindings.filter((f) => f.status === "fail");

  // Other strong signals (external, high-scoring modules)
  const externalModule = result.modules.find((m) => m.slug === "external");
  const wikiFinding = externalModule?.findings.find((f) =>
    f.label.toLowerCase().includes("wikipedia")
  );
  const redditFinding = externalModule?.findings.find((f) =>
    f.label.toLowerCase().includes("reddit")
  );

  const hasAnyData = aiFindings.length > 0 || wikiFinding || redditFinding;
  if (!hasAnyData) return null;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Where you show up (GREEN) */}
      <div className="p-5 rounded-2xl bg-[#34c759]/[0.04] border border-[#34c759]/[0.15] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#34c759]/15 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#248a3d]">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Where you show up</h3>
        </div>

        <div className="space-y-2">
          {showsUp.length === 0 && showsUpButWeak.length === 0 && !wikiFinding?.status.includes("pass") ? (
            <p className="text-[13px] text-muted-foreground italic">Nothing significant. This is a problem.</p>
          ) : (
            <>
              {showsUp.map((f, i) => (
                <AIQueryItem key={i} scenario={f.label} detail={f.detail} status="strong" />
              ))}
              {showsUpButWeak.map((f, i) => (
                <AIQueryItem key={`w-${i}`} scenario={f.label} detail={f.detail} status="weak" />
              ))}
              {wikiFinding?.status === "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#34c759]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#248a3d]"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Wikipedia</span>
                    <span className="text-muted-foreground">: {wikiFinding.detail.replace(/^Found: /, "").slice(0, 120)}...</span>
                  </div>
                </div>
              )}
              {redditFinding?.status === "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#34c759]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#248a3d]"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Reddit</span>
                    <span className="text-muted-foreground">: {redditFinding.detail}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Where you don't (RED) */}
      <div className="p-5 rounded-2xl bg-[#ff453a]/[0.04] border border-[#ff453a]/[0.15] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#ff453a]/15 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[#d70015]">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Where you don&apos;t</h3>
        </div>

        <div className="space-y-2">
          {invisible.length === 0 && (!wikiFinding || wikiFinding.status === "pass") && (!redditFinding || redditFinding.status !== "fail") ? (
            <p className="text-[13px] text-muted-foreground italic">Nothing critical here. Nice work.</p>
          ) : (
            <>
              {invisible.map((f, i) => (
                <AIQueryItem key={i} scenario={f.label} detail={f.detail} status="missing" />
              ))}
              {wikiFinding?.status !== "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#ff453a]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#d70015]"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Wikipedia</span>
                    <span className="text-muted-foreground">: No article found for this brand</span>
                  </div>
                </div>
              )}
              {redditFinding?.status === "fail" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#ff453a]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#d70015]"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Reddit</span>
                    <span className="text-muted-foreground">: No organic discussions found</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function AIQueryItem({
  scenario,
  detail,
  status,
}: {
  scenario: string;
  detail: string;
  status: "strong" | "weak" | "missing";
}) {
  const colors = {
    strong: { bg: "bg-[#34c759]/20", text: "text-[#248a3d]" },
    weak: { bg: "bg-[#ff9f0a]/20", text: "text-[#c77c02]" },
    missing: { bg: "bg-[#ff453a]/20", text: "text-[#d70015]" },
  };
  const icons = {
    strong: <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>,
    weak: <circle cx="12" cy="12" r="4" fill="currentColor"/>,
    missing: <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>,
  };
  const c = colors[status];

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
      <div className={`w-[16px] h-[16px] rounded-full ${c.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className={c.text}>
          {icons[status]}
        </svg>
      </div>
      <div className="text-[13px] leading-snug min-w-0 flex-1">
        <div className="font-semibold text-foreground">{scenario}</div>
        <div className="text-[12px] text-muted-foreground mt-0.5 leading-[1.5]">{detail}</div>
      </div>
    </div>
  );
}

/* ── AI Competitors ──────────────────────────────────────────────── */

function AICompetitors({ competitors }: { competitors: AuditResult["aiCompetitors"] }) {
  if (!competitors || competitors.length === 0) return null;

  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#ec4899] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Who AI thinks your competitors are</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5 leading-[1.5]">
            Brands Perplexity cited when answering questions about your space
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {competitors.map((c, i) => (
          <div key={c.domain} className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-black/[0.03]">
            <div className="w-7 h-7 rounded-lg bg-foreground/[0.06] flex items-center justify-center shrink-0">
              <span className="text-[12px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-foreground truncate">{c.domain}</div>
              <div className="text-[11px] text-muted-foreground">
                Cited in {c.mentions} {c.mentions === 1 ? "query" : "queries"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Action Plan (split recommendations) ─────────────────────────── */

function ActionPlan({ result }: { result: AuditResult }) {
  // Gather all recs with their source module for context
  const allRecs: Array<{ rec: Recommendation; moduleSlug: string; moduleName: string }> = [];
  for (const m of result.modules) {
    for (const r of m.recommendations) {
      allRecs.push({ rec: r, moduleSlug: m.slug, moduleName: m.name });
    }
  }

  // Dedupe by title
  const seen = new Set<string>();
  const deduped = allRecs.filter((r) => {
    if (seen.has(r.rec.title)) return false;
    seen.add(r.rec.title);
    return true;
  });

  // Quick Wins: technical + on-page fixes (schema, meta, technical, content modules) with medium/low priority OR high-priority fixes that are quick to implement
  const quickWinSlugs = new Set(["schema", "meta", "technical", "content"]);
  const quickWins = deduped.filter((r) => quickWinSlugs.has(r.moduleSlug));

  // Strategic: external signals, authority, AI citations (harder, take time)
  const strategicSlugs = new Set(["external", "authority", "ai-citations"]);
  const strategic = deduped.filter((r) => strategicSlugs.has(r.moduleSlug));

  // Sort each by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  quickWins.sort((a, b) => priorityOrder[a.rec.priority] - priorityOrder[b.rec.priority]);
  strategic.sort((a, b) => priorityOrder[a.rec.priority] - priorityOrder[b.rec.priority]);

  if (quickWins.length === 0 && strategic.length === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Your Action Plan</h2>
        <span className="text-[13px] font-medium text-muted-foreground">
          {deduped.length} total
        </span>
      </div>

      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#34c759]/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#248a3d]">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Quick Wins</h3>
              <p className="text-[12px] text-muted-foreground leading-tight">Technical changes you can implement this week</p>
            </div>
          </div>
          <div className="space-y-2">
            {quickWins.map((item, i) => {
              const mc = moduleColor(item.moduleSlug);
              return (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: mc.light }}>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: mc.accent }}>
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PriorityTag priority={item.rec.priority} />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {item.moduleName.split(" ")[0]}
                      </span>
                      <span className="text-[14px] font-semibold text-foreground tracking-[-0.01em]">{item.rec.title}</span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-[1.55] tracking-[-0.005em]">{item.rec.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strategic Priorities */}
      {strategic.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#7c3aed]">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Strategic Priorities</h3>
              <p className="text-[12px] text-muted-foreground leading-tight">Longer-term work that compounds over months</p>
            </div>
          </div>
          <div className="space-y-2">
            {strategic.map((item, i) => {
              const mc = moduleColor(item.moduleSlug);
              return (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: mc.light }}>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: mc.accent }}>
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PriorityTag priority={item.rec.priority} />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {item.moduleName.split(" ")[0]}
                      </span>
                      <span className="text-[14px] font-semibold text-foreground tracking-[-0.01em]">{item.rec.title}</span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-[1.55] tracking-[-0.005em]">{item.rec.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Competitor Comparison ───────────────────────────────────────── */

function CompetitorComparison({
  primary,
  competitors,
}: {
  primary: AuditResult;
  competitors: AuditResult[];
}) {
  const all = [primary, ...competitors];
  const modules = primary.modules.map((m) => m.slug);

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Competitor Comparison</h2>
        <span className="text-[13px] font-medium text-muted-foreground">
          {competitors.length} competitor{competitors.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Overall score comparison */}
      <div className="p-5 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
          Overall GEO Score
        </div>
        <div className="space-y-3">
          {all.map((site, i) => {
            const sc = scoreColor(site.overallScore);
            const isWinner = site.overallScore === Math.max(...all.map((s) => s.overallScore));
            const isPrimary = i === 0;
            return (
              <div key={site.domain}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[14px] font-semibold truncate ${isPrimary ? "text-foreground" : "text-muted-foreground"}`}>
                      {site.domain}
                    </span>
                    {isPrimary && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/[0.06] text-muted-foreground">
                        You
                      </span>
                    )}
                    {isWinner && !isPrimary && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#34c759]/10 text-[#248a3d]">
                        Leader
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">{site.grade}</span>
                    <span className="text-[16px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color: sc.bg }}>
                      {site.overallScore}
                    </span>
                  </div>
                </div>
                <div className="h-[6px] rounded-full bg-foreground/[0.04] overflow-hidden">
                  <div className="h-full rounded-full animate-bar" style={{ width: `${site.overallScore}%`, background: `linear-gradient(90deg, ${sc.bg}80, ${sc.bg})` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-module comparison */}
      <div className="p-5 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
          Category Breakdown
        </div>
        <div className="space-y-4">
          {modules.map((slug) => {
            const mc = moduleColor(slug);
            const moduleName = primary.modules.find((m) => m.slug === slug)?.name || slug;
            const scores = all.map((site) => ({
              domain: site.domain,
              score: site.modules.find((m) => m.slug === slug)?.score ?? 0,
            }));
            const maxScore = Math.max(...scores.map((s) => s.score));
            return (
              <div key={slug} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full" style={{ background: mc.accent }} />
                  <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">{moduleName}</span>
                </div>
                <div className="space-y-1.5 pl-3">
                  {scores.map((s, i) => {
                    const isPrimary = i === 0;
                    const isLeader = s.score === maxScore;
                    return (
                      <div key={s.domain} className="flex items-center gap-2">
                        <span className={`text-[12px] w-[140px] truncate ${isPrimary ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {s.domain}
                        </span>
                        <div className="flex-1 h-[4px] rounded-full bg-foreground/[0.04] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: mc.accent, opacity: isPrimary ? 1 : 0.5 }} />
                        </div>
                        <span className={`text-[12px] font-semibold tabular-nums w-7 text-right ${isLeader ? "text-foreground" : "text-muted-foreground"}`} style={{ color: isLeader ? mc.accent : undefined }}>
                          {s.score}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Dashboard ───────────────────────────────────────────────────── */

export function AuditDashboard({
  result,
  onBack,
}: {
  result: AuditResult;
  onBack: () => void;
}) {
  const c = scoreColor(result.overallScore);

  return (
    <div className="flex-1 max-w-[680px] mx-auto w-full px-6 py-8 space-y-12">
      {/* Nav */}
      <nav className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="h-9 px-4 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] text-[13px] font-semibold text-foreground tracking-[-0.01em] flex items-center gap-2 transition-all duration-200 hover:bg-foreground/[0.08] hover:border-foreground/[0.1] active:scale-[0.97]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
          </svg>
          New Audit
        </button>
        <a href="https://twopointtechnologies.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
          <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-7 rounded transition-opacity group-hover:opacity-80" />
        </a>
      </nav>

      {/* Executive Summary (now includes gauge, domain, grade) */}
      <ExecutiveSummary result={result} />

      {/* Where you show up / Where you don't */}
      <WhereResults result={result} />

      {/* AI Competitors (who AI thinks you compete with) */}
      <AICompetitors competitors={result.aiCompetitors} />

      {/* Competitor Comparison (user-added competitors) */}
      {result.competitors && result.competitors.length > 0 && (
        <CompetitorComparison primary={result} competitors={result.competitors} />
      )}

      {/* Action Plan */}
      <ActionPlan result={result} />

      {/* Technical Deep Dive (collapsed) */}
      <TechnicalDeepDive result={result} />

      {/* Floating chat popup (replaces inline download + contact sections) */}
      <ChatPopup result={result} />

      {/* Compact meta info (pages audited + methodology) */}
      <MetaInfo result={result} />

      {/* Footer */}
      <footer className="text-center pb-10 pt-4">
        <a
          href="https://twopointtechnologies.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 group"
        >
          <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-6 rounded transition-opacity group-hover:opacity-80" />
          <span className="text-[12px] text-muted-foreground/40 group-hover:text-muted-foreground transition-colors font-medium">
            Made by Two Point Technologies
          </span>
        </a>
      </footer>
    </div>
  );
}

/* ── Technical Deep Dive (collapsed detailed analysis) ───────────── */

function TechnicalDeepDive({ result }: { result: AuditResult }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-black/[0.01] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Technical Deep Dive</h3>
            <p className="text-[12px] text-muted-foreground">Full score breakdown and detailed analysis per category</p>
          </div>
        </div>
        <svg className={`w-4 h-4 text-muted-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-5 pt-0 space-y-6">
          <div className="h-px bg-black/[0.04]" />

          {/* Score Breakdown */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
              Score breakdown
            </div>
            <div className="space-y-4 p-4 rounded-xl bg-[#f5f5f7] border border-black/[0.03]">
              {result.modules.map((m) => {
                const mc = moduleColor(m.slug);
                return <ScoreBar key={m.slug} score={m.score} label={m.name} color={mc.accent} />;
              })}
            </div>
          </div>

          {/* Per-module findings */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
              Detailed analysis
            </div>
            <div className="space-y-3">
              {result.modules.map((m) => (
                <ModuleCard key={m.slug} module={m} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Meta Info (pages + methodology, compact) ────────────────────── */

function MetaInfo({ result }: { result: AuditResult }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors border-t border-black/[0.04]"
      >
        <span className="flex items-center gap-3">
          <span className="font-medium">Audit details &amp; methodology</span>
          <span className="text-muted-foreground/50">
            {result.pagesAudited?.length || 1} page{(result.pagesAudited?.length || 1) > 1 ? "s" : ""} &middot; {new Date(result.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="pb-4 pt-1 space-y-4">
          {result.pagesAudited && result.pagesAudited.length > 1 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 mb-2">Pages audited</div>
              <div className="space-y-1.5">
                {result.pagesAudited.map((page, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]">
                    <span className="text-[11px] font-semibold text-muted-foreground/40 tabular-nums w-4 text-right">{i + 1}</span>
                    <span className="text-muted-foreground truncate">{page.replace(/^https?:\/\//, "")}</span>
                    {i === 0 && <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">homepage</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[13px] text-muted-foreground leading-[1.6]">
            Chedder audits the on-site factors AI models use to decide which brands to recommend: structured data, meta tags, content quality, AI crawler access, trust signals. We also test real queries on Perplexity and check your presence on Wikipedia and Reddit. A complete strategy also requires backlinks and broader brand monitoring not covered here.
          </div>
        </div>
      )}
    </section>
  );
}
