"use client";

import { useState, useEffect, useRef } from "react";
import { AuditResult, ModuleResult, Finding, Recommendation, DestinationAnalysis } from "@/lib/types";
import { generateAuditPDF } from "@/lib/generate-pdf";
import { CodeSnippet } from "@/components/code-snippet";
import { track, getDeviceId, getLeadEmail } from "@/lib/track";
import {
  destinationKindLabel,
  destinationKindColor,
  type DestinationKind,
} from "@/lib/analyzers/destinations";

// Shape returned by /api/audits/recent — kept inline to avoid a shared
// type dependency loop. Must match RecentAuditEntry in audit-store.ts.
interface RecentAuditEntry {
  slug: string;
  domain: string;
  url: string;
  overallScore: number;
  grade: string;
  timestamp: string;
}

/* ── Module color palette ────────────────────────────────────────── */

const MODULE_COLORS: Record<string, { accent: string; light: string; dark: string }> = {
  schema:    { accent: "#6f7e94", light: "rgba(111,126,148,0.08)",  dark: "#54647a" },
  meta:      { accent: "#6f8aab", light: "rgba(111,138,171,0.08)",  dark: "#4d6478" },
  content:   { accent: "#9a7aa0", light: "rgba(154,122,160,0.08)",  dark: "#7a5c82" },
  technical: { accent: "#c99b66", light: "rgba(201,155,102,0.08)",  dark: "#8b6738" },
  authority: { accent: "#7a8b6b", light: "rgba(122,139,107,0.08)",  dark: "#52614a" },
  external:  { accent: "#c2745f", light: "rgba(194,116,95,0.08)",  dark: "#a65b47" },
  "ai-citations": { accent: "#7a8b6b", light: "rgba(122,139,107,0.08)", dark: "#52614a" },
};

function moduleColor(slug: string) {
  return MODULE_COLORS[slug] || MODULE_COLORS.schema;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function scoreColor(s: number) {
  if (s >= 70) return { bg: "#7a8b6b", bgLight: "rgba(122,139,107,0.08)", text: "#52614a" };
  if (s >= 40) return { bg: "#c99b66", bgLight: "rgba(201,155,102,0.08)", text: "#8b6738" };
  return { bg: "#b5443b", bgLight: "rgba(181,68,59,0.08)", text: "#8c3128" };
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
  const trackStroke = isDark ? "#ffffff" : "#1f1e1d";
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
      <div className="w-[18px] h-[18px] rounded-full bg-[#7a8b6b]/10 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#52614a]">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  if (status === "warn")
    return (
      <div className="w-[18px] h-[18px] rounded-full bg-[#c99b66]/10 flex items-center justify-center shrink-0">
        <div className="w-[6px] h-[6px] rounded-full bg-[#8b6738]" />
      </div>
    );
  return (
    <div className="w-[18px] h-[18px] rounded-full bg-[#b5443b]/10 flex items-center justify-center shrink-0">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-[#8c3128]">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

/* ── Priority Tag ────────────────────────────────────────────────── */

function PriorityTag({ priority }: { priority: Recommendation["priority"] }) {
  const styles: Record<string, { bg: string; text: string }> = {
    high: { bg: "bg-[#b5443b]/8", text: "text-[#8c3128]" },
    medium: { bg: "bg-[#c99b66]/8", text: "text-[#8b6738]" },
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

function ModuleCard({
  module,
  benchmark,
}: {
  module: ModuleResult;
  benchmark?: { median: number; count: number };
}) {
  const [open, setOpen] = useState(false);
  const mc = moduleColor(module.slug);
  const delta = benchmark && benchmark.count >= 5 ? module.score - benchmark.median : null;

  return (
    <div className="rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Color accent bar */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${mc.accent}60, ${mc.accent})` }} />

      <button
        className="w-full text-left px-5 py-[18px] flex items-center justify-between gap-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-2 h-8 rounded-full shrink-0" style={{ background: mc.accent }} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-foreground tracking-[-0.01em] leading-snug">{module.name}</div>
            <div className="text-[13px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{module.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: mc.accent }}>
              {module.score}
            </span>
            {delta !== null && (
              <span
                className="text-[10px] font-semibold tabular-nums mt-1"
                style={{ color: delta >= 0 ? "#52614a" : "#b5443b" }}
                title={`Median: ${benchmark!.median} · based on ${benchmark!.count} audits`}
              >
                {delta >= 0 ? "+" : ""}{delta} vs median
              </span>
            )}
          </div>
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
          <div className="h-px bg-foreground/[0.04]" />

          <div className="relative h-[5px] rounded-full bg-foreground/[0.04] overflow-visible">
            <div className="h-full rounded-full animate-bar" style={{ width: `${module.score}%`, background: `linear-gradient(90deg, ${mc.accent}70, ${mc.accent})` }} />
            {benchmark && benchmark.count >= 5 && (
              <div
                className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-foreground/40 rounded-full"
                style={{ left: `${benchmark.median}%` }}
                title={`Median: ${benchmark.median}`}
              />
            )}
          </div>
          {benchmark && benchmark.count >= 5 && (
            <div className="text-[11px] text-muted-foreground -mt-3">
              Median across {benchmark.count} audits: <span className="tabular-nums font-semibold text-foreground/80">{benchmark.median}</span>
            </div>
          )}

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
                  <ModuleRecItem key={i} rec={r} color={mc} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleRecItem({ rec, color }: { rec: Recommendation; color: { accent: string; light: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="p-3.5 rounded-xl border border-foreground/[0.05] space-y-1.5" style={{ background: color.light }}>
      <div className="flex items-center gap-2">
        <PriorityTag priority={rec.priority} />
        <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">{rec.title}</span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-[1.55] tracking-[-0.005em]">{rec.description}</p>
      {rec.fixSnippet && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground/70 hover:text-foreground transition-colors"
            style={{ color: expanded ? color.accent : undefined }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={expanded ? "rotate-90 transition-transform" : "transition-transform"}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            {expanded ? "Hide" : "Show"} fix
          </button>
          {expanded && (
            <CodeSnippet
              code={rec.fixSnippet}
              language={rec.language || "html"}
              target={rec.snippetTarget}
            />
          )}
        </>
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
  // Tracks whether the server actually emailed the PDF — so the "Done"
  // state can say "check your inbox" (truthful) vs. only "downloads
  // folder" (the fallback when email isn't wired up yet).
  const [emailDelivered, setEmailDelivered] = useState(false);

  async function submitPDF() {
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    const lead = {
      name,
      email,
      website: result.domain,
      message: `PDF download requested. Company: ${company || "N/A"}`,
      score: result.overallScore,
      source: "pdf-download" as const,
      company,
      // slug lets the server regenerate the PDF and email it as an
      // attachment without us having to ship PDF bytes from the browser.
      slug: result.slug,
    };
    const [, contactRes] = await Promise.allSettled([
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

    // Whether the server-side email attachment delivery succeeded
    let pdfSent = false;
    if (contactRes.status === "fulfilled") {
      try {
        const data = (await contactRes.value.json()) as { pdfSent?: boolean };
        pdfSent = !!data?.pdfSent;
      } catch {
        // ignore
      }
    }
    setEmailDelivered(pdfSent);

    // Also save locally as a belt-and-braces copy so the user has the
    // file in their downloads folder even if the email bounces.
    const doc = generateAuditPDF(result);
    doc.save(`${result.domain}-geo-audit.pdf`);

    // Tag the funnel: this is the conversion event we care about most
    // (PDF requested + delivered). emailDelivered is captured above.
    track(
      "pdf.downloaded",
      { domain: result.domain, emailDelivered: pdfSent ? "yes" : "no" },
      { slug: result.slug }
    );

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
      <circle cx="50" cy="50" r="45" fill="#d8a23e"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#b58632" strokeWidth="3"/>
      <circle cx="35" cy="35" r="4" fill="#b58632" opacity="0.6"/>
      <circle cx="65" cy="40" r="3" fill="#b58632" opacity="0.6"/>
      <circle cx="55" cy="60" r="5" fill="#b58632" opacity="0.6"/>
      <circle cx="35" cy="65" r="3" fill="#b58632" opacity="0.6"/>
    </svg>
  );

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 h-14 px-5 rounded-full bg-[#1f1e1d] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:shadow-[0_10px_32px_rgba(0,0,0,0.22)] transition-all active:scale-[0.97] flex items-center gap-2.5 font-semibold text-[14px] tracking-[-0.01em]"
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
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto sm:bottom-6 sm:right-6 z-50 sm:w-[380px] rounded-3xl bg-white shadow-[0_12px_48px_rgba(0,0,0,0.16)] border border-foreground/[0.07] overflow-hidden flex flex-col max-h-[calc(100vh-60px)]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-foreground/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#d8a23e]/20 flex items-center justify-center">
                {cheeseIcon}
              </div>
              <div>
                <div className="text-[14px] font-semibold tracking-[-0.01em]">Chedder</div>
                <div className="text-[11px] text-muted-foreground">by Two Point Technologies</div>
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); reset(); }}
              className="w-8 h-8 rounded-lg hover:bg-foreground/[0.04] transition-colors flex items-center justify-center text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Greeting bubble */}
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#d8a23e]/20 flex items-center justify-center shrink-0 mt-0.5">
                {cheeseIcon}
              </div>
              <div className="flex-1">
                <div className="inline-block max-w-full p-3 rounded-2xl rounded-tl-md bg-[var(--secondary)] text-[13px] leading-[1.55] text-foreground">
                  {mode === "intro" && <>Want the full audit for <strong>{result.domain}</strong> as a PDF? Pop your details in and I&apos;ll email it over.</>}
                  {mode === "done" && (
                    emailDelivered ? (
                      <>Sent 🎉 Check <strong>{email}</strong> for your <strong>{result.domain}-geo-audit.pdf</strong>. A copy is in your downloads folder too. We&apos;ll reach out if we can help with any of the findings.</>
                    ) : (
                      <>Saved 🎉 Your <strong>{result.domain}-geo-audit.pdf</strong> is in your downloads folder. Email delivery didn&apos;t land this time, so check the local copy for your action plan.</>
                    )
                  )}
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
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--secondary)] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Work email"
                  required
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--secondary)] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company (optional)"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--secondary)] border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-white transition-all"
                />
                <button
                  type="submit"
                  disabled={sending || !name.trim() || !email.trim()}
                  className="w-full h-10 rounded-xl bg-[#1f1e1d] text-white text-[13px] font-semibold hover:bg-[#1f1e1d]/85 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2 mt-1"
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
                  className="w-full h-10 rounded-xl bg-[#1f1e1d] text-white text-[13px] font-semibold hover:bg-[#1f1e1d]/85 active:scale-[0.99] transition-all"
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
            className="flex items-center justify-center gap-2 py-2.5 border-t border-foreground/[0.06] hover:bg-foreground/[0.02] transition-colors"
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
      <div className="p-5 rounded-2xl bg-[#7a8b6b]/[0.04] border border-[#7a8b6b]/[0.15] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#7a8b6b]/15 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#52614a]">
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
                <AIQueryItem key={i} finding={f} status="strong" />
              ))}
              {showsUpButWeak.map((f, i) => (
                <AIQueryItem key={`w-${i}`} finding={f} status="weak" />
              ))}
              {wikiFinding?.status === "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#7a8b6b]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#52614a]"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Wikipedia</span>
                    <span className="text-muted-foreground">: {wikiFinding.detail.replace(/^Found: /, "").slice(0, 120)}...</span>
                  </div>
                </div>
              )}
              {redditFinding?.status === "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#7a8b6b]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#52614a]"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Reddit</span>
                    <span className="text-muted-foreground">: {redditFinding.detail}</span>
                  </div>
                </div>
              )}
              {/* Reddit topPost discussion if present */}
              {externalModule?.findings
                .filter((f) => f.label.toLowerCase().includes("top reddit"))
                .map((f, i) => (
                  <div key={`rt-${i}`} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                    <div className="w-[16px] h-[16px] rounded-full bg-[#7a8b6b]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#52614a]"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="text-[13px] leading-snug min-w-0 flex-1">
                      <div className="font-semibold text-foreground">Top Reddit thread</div>
                      <div className="text-[12px] text-muted-foreground mt-0.5 leading-[1.5]">{f.detail}</div>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* Where you don't (RED) */}
      <div className="p-5 rounded-2xl bg-[#b5443b]/[0.04] border border-[#b5443b]/[0.15] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#b5443b]/15 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[#8c3128]">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Where you don&apos;t</h3>
        </div>

        <div className="space-y-2">
          {invisible.length === 0 && (!wikiFinding || wikiFinding.status === "pass") && (!redditFinding || redditFinding.status === "pass") ? (
            <p className="text-[13px] text-muted-foreground italic">Nothing critical here. Nice work.</p>
          ) : (
            <>
              {invisible.map((f, i) => (
                <AIQueryItem key={i} finding={f} status="missing" />
              ))}
              {wikiFinding?.status !== "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#b5443b]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#8c3128]"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  </div>
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold">Wikipedia</span>
                    <span className="text-muted-foreground">: No article found for this brand</span>
                  </div>
                </div>
              )}
              {redditFinding && redditFinding.status !== "pass" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/60">
                  <div className={`w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-0.5 ${redditFinding.status === "fail" ? "bg-[#b5443b]/20" : "bg-[#c99b66]/20"}`}>
                    {redditFinding.status === "fail" ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#8c3128]"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-[#8b6738]"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
                    )}
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
    </section>
  );
}

function AIQueryItem({
  finding,
  status,
}: {
  finding: Finding;
  status: "strong" | "weak" | "missing";
}) {
  const [open, setOpen] = useState(false);
  const colors = {
    strong: { bg: "bg-[#7a8b6b]/20", text: "text-[#52614a]", quoteAccent: "#7a8b6b" },
    weak: { bg: "bg-[#c99b66]/20", text: "text-[#8b6738]", quoteAccent: "#c99b66" },
    missing: { bg: "bg-[#b5443b]/20", text: "text-[#8c3128]", quoteAccent: "#b5443b" },
  };
  const icons = {
    strong: <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>,
    weak: <circle cx="12" cy="12" r="4" fill="currentColor"/>,
    missing: <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>,
  };
  const c = colors[status];
  const hasExcerpt = !!finding.excerpt;

  return (
    <div className="rounded-xl bg-white/60 overflow-hidden">
      <button
        type="button"
        onClick={() => hasExcerpt && setOpen(!open)}
        className={`w-full flex items-start gap-2.5 p-3 text-left ${hasExcerpt ? "hover:bg-white/80 transition-colors" : "cursor-default"}`}
      >
        <div className={`w-[16px] h-[16px] rounded-full ${c.bg} flex items-center justify-center shrink-0 mt-0.5`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className={c.text}>
            {icons[status]}
          </svg>
        </div>
        <div className="text-[13px] leading-snug min-w-0 flex-1">
          <div className="font-semibold text-foreground">{finding.label}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5 leading-[1.5]">{finding.detail}</div>
          {hasExcerpt && !open && (
            <div className="text-[11px] text-muted-foreground/70 mt-1.5 flex items-center gap-1 font-medium">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7"/></svg>
              See what AI said
            </div>
          )}
        </div>
      </button>

      {hasExcerpt && open && (
        <div className="px-3 pb-3">
          <div className="rounded-lg bg-white p-3 border-l-[3px] relative" style={{ borderLeftColor: c.quoteAccent }}>
            <div className="absolute top-2 right-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill={c.quoteAccent} fillOpacity="0.2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
              </svg>
            </div>
            <p className="text-[12.5px] text-foreground/80 leading-[1.65] italic pr-5">
              <HighlightedText text={finding.excerpt!} highlight={finding.highlight} />
            </p>
            {finding.sourceUrl && (
              <div className="mt-2 pt-2 border-t border-foreground/[0.06] flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/60">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <a
                  href={finding.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground/70 hover:text-foreground truncate transition-colors"
                >
                  {finding.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render text with case-insensitive highlighting of a substring.
 */
function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight) return <>{text}</>;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <strong key={i} className="font-bold text-foreground not-italic bg-foreground/[0.06] px-0.5 rounded-sm">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* ── AI Competitors ──────────────────────────────────────────────── */

function AICompetitors({
  result,
  competitors,
}: {
  result: AuditResult;
  competitors: AuditResult["aiCompetitors"];
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!competitors || competitors.length === 0) return null;

  // Top 3 competitor domains, HTTPS-prefixed so /api/audit can consume them.
  const topDomains = competitors.slice(0, 3).map((c) => `https://${c.domain}`);

  async function runLandGrabCompare() {
    if (running) return;
    setRunning(true);
    setError(null);
    track(
      "compare.started",
      { source: "ai-competitors", competitors: topDomains.length },
      { slug: result.slug }
    );
    try {
      // Streaming endpoint — keeps the SSE connection alive past the
      // ~30s browser-side edge idle timeout that killed the previous
      // non-streaming POST.
      const res = await fetch("/api/audit/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          competitors: topDomains,
          deviceId: getDeviceId(),
          leadEmail: getLeadEmail(),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Compare didn't finish. Try again.");
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSlug: string | null = null;
      let finalError: string | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.type === "done") finalSlug = evt.result?.slug ?? null;
            else if (evt.type === "error") finalError = evt.message ?? "Compare failed";
          } catch {
            // malformed frame
          }
        }
      }
      if (finalError) {
        setError(finalError);
        setRunning(false);
        return;
      }
      if (!finalSlug) {
        setError("Compare finished but we couldn't find the result. Try again.");
        setRunning(false);
        return;
      }
      window.location.href = `/a/${finalSlug}`;
    } catch {
      setError("Couldn't reach our servers. Try again in a moment.");
      setRunning(false);
    }
  }

  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6f7e94] to-[#c2745f] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Who AI thinks your competitors are</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5 leading-[1.5]">
            Brands AI tools brought up when customers asked about your space
          </p>
        </div>
      </div>

      {/* CTA sits above the list so the "take land" action is the first
          thing a user sees after the heading. Under-list placement made
          it feel like an afterthought once scrolling through competitors. */}
      <div>
        <button
          onClick={runLandGrabCompare}
          disabled={running}
          className="w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[14px] tracking-[-0.01em] disabled:opacity-60 disabled:cursor-wait hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
        >
          {running ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              Auditing competitors, this takes about a minute…
            </>
          ) : (
            <>See where you can take land from them</>
          )}
        </button>
        <p className="text-[11.5px] text-muted-foreground/80 text-center mt-2 leading-snug">
          We'll audit the top {topDomains.length} and show you the openings where they're ahead, where you lead, and specific fixes that close the gap.
        </p>
        {error && (
          <div className="text-[12.5px] text-[#8c3128] bg-[#b5443b]/[0.06] border border-[#b5443b]/[0.15] rounded-lg px-3 py-2 leading-snug mt-2">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 pt-2 border-t border-foreground/[0.07]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 mb-1">
          The {competitors.length} brands AI names most
        </div>
        {competitors.map((c, i) => (
          <div key={c.domain} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--secondary)] border border-foreground/[0.05]">
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

/* ── Action Plan (roadmap with phases + priority sequence) ──────── */

type Horizon = "now" | "soon" | "later";

const HORIZON_META: Record<
  Horizon,
  {
    label: string;
    timeframe: string;
    blurb: string;
    accent: string;
    light: string;
    ring: string;
  }
> = {
  now: {
    label: "Now",
    timeframe: "This week",
    blurb: "Copy-paste fixes and tag edits. No roadmap required.",
    accent: "#7a8b6b",
    light: "rgba(122,139,107,0.1)",
    ring: "rgba(122,139,107,0.28)",
  },
  soon: {
    label: "Next",
    timeframe: "2 to 4 weeks",
    blurb: "A small content or dev cycle. Structured pages, contact blocks, robots rules.",
    accent: "#c99b66",
    light: "rgba(201,155,102,0.1)",
    ring: "rgba(201,155,102,0.28)",
  },
  later: {
    label: "Later",
    timeframe: "This quarter",
    blurb: "Authority signals, external mentions, AI citation wins. Compounding work.",
    accent: "#9a7aa0",
    light: "rgba(154,122,160,0.1)",
    ring: "rgba(154,122,160,0.28)",
  },
};

const FAST_MODULES = new Set(["schema", "meta", "technical", "content"]);

function classifyHorizon(
  moduleSlug: string,
  priority: Recommendation["priority"]
): Horizon {
  const fast = FAST_MODULES.has(moduleSlug);
  if (fast && priority === "high") return "now";
  if (fast) return "soon";
  if (priority === "high") return "soon";
  return "later";
}

type RoadmapItem = {
  rec: Recommendation;
  moduleSlug: string;
  moduleName: string;
  seq: number;
};

function ActionPlan({ result }: { result: AuditResult }) {
  // Gather all recs with their source module
  const allRecs: Array<Omit<RoadmapItem, "seq">> = [];
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

  if (deduped.length === 0) return null;

  // Bucket by horizon, sort each by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const buckets: Record<Horizon, Array<Omit<RoadmapItem, "seq">>> = {
    now: [],
    soon: [],
    later: [],
  };
  for (const item of deduped) {
    buckets[classifyHorizon(item.moduleSlug, item.rec.priority)].push(item);
  }
  (Object.keys(buckets) as Horizon[]).forEach((h) => {
    buckets[h].sort(
      (a, b) => priorityOrder[a.rec.priority] - priorityOrder[b.rec.priority]
    );
  });

  // Assign a global sequence so users see a single ordered list 1..N
  const phaseOrder: Horizon[] = ["now", "soon", "later"];
  let seq = 0;
  const phases: Array<{ key: Horizon; items: RoadmapItem[] }> = [];
  for (const key of phaseOrder) {
    const items: RoadmapItem[] = buckets[key].map((it) => ({
      ...it,
      seq: ++seq,
    }));
    if (items.length > 0) phases.push({ key, items });
  }

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
          Your Roadmap
        </h2>
        <span className="text-[13px] font-medium text-muted-foreground">
          {deduped.length} step{deduped.length === 1 ? "" : "s"} · ordered by priority
        </span>
      </div>

      <div className="relative pl-10 sm:pl-12">
        {/* Vertical spine */}
        <div className="pointer-events-none absolute left-4 sm:left-5 top-3 bottom-3 w-px bg-foreground/[0.09]" />

        <div className="space-y-8">
          {phases.map(({ key, items }) => {
            const meta = HORIZON_META[key];
            return (
              <div key={key} className="relative">
                {/* Phase milestone marker */}
                <div
                  className="absolute -left-[30px] sm:-left-[34px] top-0 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    background: meta.light,
                    boxShadow: `0 0 0 4px var(--background), 0 0 0 5px ${meta.ring}`,
                  }}
                  aria-hidden
                >
                  <span
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: meta.accent }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Phase header */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded"
                      style={{ background: meta.light, color: meta.accent }}
                    >
                      {meta.label}
                    </span>
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em]">
                      {meta.timeframe}
                    </h3>
                  </div>
                  <p className="text-[12.5px] text-muted-foreground leading-[1.55] mt-1">
                    {meta.blurb}
                  </p>
                </div>

                {/* Items in this phase */}
                <div className="space-y-2">
                  {items.map((it) => (
                    <ActionItem
                      key={`${key}-${it.seq}`}
                      item={it}
                      seq={it.seq}
                      accent={meta.accent}
                      light={meta.light}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Roadmap action item (expandable when a code snippet is available) ─ */

function ActionItem({
  item,
  seq,
  accent,
  light,
}: {
  item: { rec: Recommendation; moduleSlug: string; moduleName: string };
  seq: number;
  accent: string;
  light: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSnippet = !!item.rec.fixSnippet;

  return (
    <div className="rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: light }}
        >
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: accent }}
          >
            {seq}
          </span>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityTag priority={item.rec.priority} />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate max-w-[180px]">
              {item.moduleName}
            </span>
            <span className="text-[14px] font-semibold text-foreground tracking-[-0.01em]">
              {item.rec.title}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground leading-[1.55] tracking-[-0.005em]">
            {item.rec.description}
          </p>
          {hasSnippet && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
              style={{ color: expanded ? accent : undefined }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  expanded ? "rotate-90 transition-transform" : "transition-transform"
                }
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {expanded ? "Hide" : "Show"} the exact fix
            </button>
          )}
        </div>
      </div>
      {hasSnippet && expanded && item.rec.fixSnippet && (
        <div className="px-4 pb-4 -mt-1">
          <CodeSnippet
            code={item.rec.fixSnippet}
            language={item.rec.language || "html"}
            target={item.rec.snippetTarget}
          />
        </div>
      )}
    </div>
  );
}

/* ── Land Grab Insights ─────────────────────────────────────────────
 *
 * Builds the "where can we take land from competitors" view. This is
 * the single most useful thing the competitor comparison should tell
 * a marketer: not just the raw scores, but the specific openings.
 *
 * Three sections:
 *   1. "Take land"   — opportunities where competitors are winning and you
 *                     aren't. Biggest gaps first.
 *   2. "You lead"    — your strongholds. Confirmation of what to defend.
 *   3. "Quick wins"  — specific finding-level gaps with a clear fix
 *                     (e.g. "You're missing FAQ schema. Saatva has it.").
 *
 * The builder lives inline with the component because it's tightly
 * coupled to how the UI presents the data.
 */

type LandGrabItem = {
  kind: "take" | "lead" | "quickwin";
  title: string;
  detail: string;
  /** Higher = more important. Used to sort within a section. */
  weight: number;
};

function buildLandGrabInsights(
  primary: AuditResult,
  competitors: AuditResult[]
): {
  take: LandGrabItem[];
  lead: LandGrabItem[];
  quickwin: LandGrabItem[];
} {
  const take: LandGrabItem[] = [];
  const lead: LandGrabItem[] = [];
  const quickwin: LandGrabItem[] = [];

  if (competitors.length === 0) return { take, lead, quickwin };

  // ── Module-level gaps ────────────────────────────────────────────
  for (const myMod of primary.modules) {
    const theirScores = competitors
      .map((c) => c.modules.find((m) => m.slug === myMod.slug)?.score)
      .filter((s): s is number => typeof s === "number");
    if (theirScores.length === 0) continue;

    const avgCompetitor =
      theirScores.reduce((a, b) => a + b, 0) / theirScores.length;
    const delta = myMod.score - avgCompetitor;
    // Module name is already human-friendly in the data (e.g. "The labels
    // AI reads first"). Lowercase it within sentences for cleaner prose.
    const moduleName = myMod.name;

    if (delta <= -15) {
      // Significant gap = real land-grab opportunity.
      take.push({
        kind: "take",
        title: `Competitors outscore you on ${moduleName.toLowerCase()}`,
        detail: `Your competitors average ${Math.round(avgCompetitor)} of 100 here. You sit at ${myMod.score}. Closing this is ${Math.abs(delta) >= 30 ? "the biggest" : "a clear"} opportunity to catch up.`,
        weight: Math.abs(delta),
      });
    } else if (delta >= 15) {
      lead.push({
        kind: "lead",
        title: `You lead on ${moduleName.toLowerCase()}`,
        detail: `You score ${myMod.score}, ${Math.round(delta)} points above the competitor average. Keep investing here. This is a defensible strength.`,
        weight: delta,
      });
    }
  }

  // ── AI scenario-level gaps ───────────────────────────────────────
  //
  // Each competitor-aware finding on ai-citations has a label like
  // "{scenario} · {AI chats|AI search}". Pass = shown up top. Fail or warn
  // = they don't/buried. If competitors are winning a scenario you're
  // failing, it's a specific place you're losing shoppers.
  const myAi = primary.modules.find((m) => m.slug === "ai-citations");
  if (myAi) {
    for (const myFinding of myAi.findings) {
      // Only look at scenario findings (they have " · AI chats" or
      // " · AI search" in the label). Skip spend-cap / reach warnings.
      if (!/ · AI (chats|search)$/.test(myFinding.label)) continue;

      const compFindings = competitors
        .map((c) => {
          const aiMod = c.modules.find((m) => m.slug === "ai-citations");
          return aiMod?.findings.find((f) => f.label === myFinding.label);
        })
        .filter((f): f is NonNullable<typeof f> => !!f);
      if (compFindings.length === 0) continue;

      const competitorsWinning = compFindings.filter((f) => f.status === "pass").length;
      const primaryWinning = myFinding.status === "pass";

      if (!primaryWinning && competitorsWinning > 0) {
        // Extract the human scenario text for a nicer headline
        const scenarioText = myFinding.label.replace(
          / · AI (chats|search)$/,
          ""
        );
        const surface = myFinding.label.match(/ · (AI (?:chats|search))$/)?.[1] ?? "";
        take.push({
          kind: "take",
          title: `${surface} dodges you: "${scenarioText.toLowerCase()}"`,
          detail: `${competitorsWinning} of ${compFindings.length} competitors show up as a top pick here. You don't. This is a specific search where their brand is being recommended instead of yours.`,
          weight: 50 + competitorsWinning * 10,
        });
      } else if (primaryWinning && competitorsWinning < compFindings.length) {
        const scenarioText = myFinding.label.replace(
          / · AI (chats|search)$/,
          ""
        );
        lead.push({
          kind: "lead",
          title: `You win: "${scenarioText.toLowerCase()}"`,
          detail: `You appear as a top pick and ${compFindings.length - competitorsWinning} of ${compFindings.length} competitors don't. Defend this.`,
          weight: 40,
        });
      }
    }
  }

  // ── Finding-level quick wins ─────────────────────────────────────
  //
  // Scan the on-site modules (not ai-citations) for cases where you
  // have a fail/warn finding and ≥1 competitor has a pass on the same
  // labeled finding. These become concrete copy-paste next steps.
  const onSiteSlugs = ["schema", "content", "meta", "technical", "authority", "external"];
  for (const slug of onSiteSlugs) {
    const myMod = primary.modules.find((m) => m.slug === slug);
    if (!myMod) continue;

    for (const myFinding of myMod.findings) {
      if (myFinding.status === "pass") continue; // already winning this one

      let compPassCount = 0;
      for (const c of competitors) {
        const cMod = c.modules.find((m) => m.slug === slug);
        const cFinding = cMod?.findings.find((f) => f.label === myFinding.label);
        if (cFinding?.status === "pass") compPassCount++;
      }
      if (compPassCount === 0) continue;

      quickwin.push({
        kind: "quickwin",
        title: myFinding.label,
        detail: `You're ${myFinding.status === "fail" ? "missing" : "weak on"} this while ${compPassCount} of ${competitors.length} competitors have it sorted. ${myFinding.detail}`,
        weight: 100 * (compPassCount / competitors.length) + (myFinding.status === "fail" ? 10 : 0),
      });
    }
  }

  take.sort((a, b) => b.weight - a.weight);
  lead.sort((a, b) => b.weight - a.weight);
  quickwin.sort((a, b) => b.weight - a.weight);

  return {
    take: take.slice(0, 5),
    lead: lead.slice(0, 3),
    quickwin: quickwin.slice(0, 6),
  };
}

function LandGrabInsights({
  primary,
  competitors,
}: {
  primary: AuditResult;
  competitors: AuditResult[];
}) {
  const { take, lead, quickwin } = buildLandGrabInsights(primary, competitors);

  if (take.length === 0 && lead.length === 0 && quickwin.length === 0) {
    return null;
  }

  const Section = ({
    title,
    subtitle,
    items,
    accent,
    bg,
  }: {
    title: string;
    subtitle: string;
    items: LandGrabItem[];
    accent: string;
    bg: string;
  }) => {
    if (items.length === 0) return null;
    return (
      <div className="p-5 rounded-2xl border" style={{ background: bg, borderColor: `${accent}33` }}>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[14px] font-semibold tracking-[-0.01em]" style={{ color: accent }}>
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground">{items.length}</div>
        </div>
        <p className="text-[12px] text-muted-foreground leading-[1.5] mb-3">{subtitle}</p>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl bg-white/70 p-3">
              <div className="text-[13px] font-semibold tracking-[-0.005em] text-foreground leading-snug">
                {item.title}
              </div>
              <div className="text-[12px] text-muted-foreground leading-[1.5] mt-1">{item.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Where you can take land</h2>
        <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
          A side by side read of every signal, sorted by the openings that matter most.
        </p>
      </div>
      <Section
        title="Take land"
        subtitle="Places where your competitors are already winning and you aren't yet. Biggest gaps first."
        items={take}
        accent="#c2745f"
        bg="rgba(194,116,95,0.06)"
      />
      <Section
        title="Quick wins"
        subtitle="Specific fixes your competitors have in place that you don't. Ship these first."
        items={quickwin}
        accent="#6f8aab"
        bg="rgba(111,138,171,0.06)"
      />
      <Section
        title="You lead"
        subtitle="Your strongholds. Defend these while you chase the land grabs."
        items={lead}
        accent="#7a8b6b"
        bg="rgba(122,139,107,0.06)"
      />
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
      <LandGrabInsights primary={primary} competitors={competitors} />

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Side by side</h2>
        <span className="text-[13px] font-medium text-muted-foreground">
          {competitors.length} competitor{competitors.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Overall score comparison */}
      <div className="p-5 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
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
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#7a8b6b]/10 text-[#52614a]">
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
      <div className="p-5 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
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
                        <span className={`text-[12px] w-[110px] sm:w-[140px] truncate shrink-0 ${isPrimary ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {s.domain}
                        </span>
                        <div className="flex-1 h-[4px] rounded-full bg-foreground/[0.04] overflow-hidden min-w-0">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: mc.accent, opacity: isPrimary ? 1 : 0.5 }} />
                        </div>
                        <span className={`text-[12px] font-semibold tabular-nums w-7 text-right shrink-0 ${isLeader ? "text-foreground" : "text-muted-foreground"}`} style={{ color: isLeader ? mc.accent : undefined }}>
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

/* ── App Chrome (sticky top bar) ─────────────────────────────────── */

/* ── Recent Audits Menu ─────────────────────────────────────────────
 *
 * The "private vessel" feel without auth: every audit we run stamps
 * the requester's deviceId and (when signed up) leadEmail. This
 * dropdown reads the per-identity index and lists their recent audits,
 * giving the signed-in-ish sense of "here's what I've looked at."
 *
 * When we add real login + Netlify DB later, this component swaps its
 * fetch source (session-bound instead of localStorage-bound) without
 * any visual change.
 */
function RecentAuditsMenu({
  currentSlug,
}: {
  currentSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const [audits, setAudits] = useState<RecentAuditEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Lazy-load the list the first time the menu opens.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    const deviceId = getDeviceId();
    const leadEmail = getLeadEmail();
    const params = new URLSearchParams();
    if (deviceId) params.set("deviceId", deviceId);
    if (leadEmail) params.set("leadEmail", leadEmail);
    fetch(`/api/audits/recent?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { audits: [] }))
      .then((data) => setAudits((data.audits ?? []) as RecentAuditEntry[]))
      .catch(() => setAudits([]));
  }, [open, loaded]);

  // Close when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const hasLead = typeof window !== "undefined" && !!getLeadEmail();

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-3 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.06] text-[13px] font-semibold text-foreground tracking-[-0.01em] flex items-center gap-1.5 transition-colors"
        title="Your recent audits"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <span className="hidden sm:inline">Your audits</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[340px] max-w-[92vw] rounded-xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-foreground/[0.07] overflow-hidden animate-[fadeIn_160ms_ease-out]">
          <div className="px-4 py-3 border-b border-foreground/[0.07] bg-foreground/[0.02]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              Your recent audits
            </div>
            {!hasLead && (
              <div className="text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">
                Saved on this browser only. Sign up to keep them across devices.
              </div>
            )}
          </div>

          {audits === null && (
            <div className="px-4 py-6 text-[12.5px] text-muted-foreground/70 italic">
              Loading…
            </div>
          )}
          {audits !== null && audits.length === 0 && (
            <div className="px-4 py-6 text-[12.5px] text-muted-foreground/80 leading-snug">
              No audits yet. Run one and it will show up here.
            </div>
          )}
          {audits !== null && audits.length > 0 && (
            <ul className="max-h-[340px] overflow-y-auto divide-y divide-black/[0.04]">
              {audits.map((a) => {
                const c = scoreColor(a.overallScore);
                const isCurrent = a.slug === currentSlug;
                return (
                  <li key={a.slug}>
                    <a
                      href={`/a/${a.slug}`}
                      className={`block px-4 py-2.5 hover:bg-foreground/[0.03] transition-colors ${
                        isCurrent ? "bg-foreground/[0.03]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {a.domain}
                            {isCurrent && (
                              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                now
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(a.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <span
                          className="text-[12px] font-bold tabular-nums px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: c.bgLight, color: c.text }}
                        >
                          {a.overallScore}
                        </span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AppChrome({
  result,
  onBack,
}: {
  result: AuditResult;
  onBack: () => void;
}) {
  const sc = scoreColor(result.overallScore);
  const [shareCopied, setShareCopied] = useState(false);
  const [reauditing, setReauditing] = useState(false);

  const chedderLogo = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-[var(--brand-gold)] flex items-center justify-center shadow-[inset_0_-1px_2px_rgba(31,30,29,0.12)]">
        <svg viewBox="0 0 100 100" className="w-4 h-4">
          <circle cx="34" cy="37" r="6" fill="#1f1e1d" opacity="0.85"/>
          <circle cx="64" cy="33" r="4" fill="#1f1e1d" opacity="0.85"/>
          <circle cx="58" cy="62" r="8" fill="#1f1e1d" opacity="0.85"/>
          <circle cx="32" cy="67" r="4" fill="#1f1e1d" opacity="0.85"/>
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Chedder</span>
    </div>
  );

  async function onShare() {
    if (!result.slug) return;
    const shareUrl = `${window.location.origin}/a/${result.slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
      track("audit.shared", { via: "copy" }, { slug: result.slug });
    } catch {
      window.prompt("Copy this URL:", shareUrl);
      track("audit.shared", { via: "prompt_fallback" }, { slug: result.slug });
    }
  }

  async function onReaudit() {
    if (reauditing) return;
    setReauditing(true);
    track("audit.reaudit", { url: result.url }, { slug: result.slug });
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          deviceId: getDeviceId(),
          leadEmail: getLeadEmail(),
        }),
      });
      const data = await res.json();
      if (res.ok && data?.slug) {
        // Navigate to the new audit's URL — full reload to render from server
        window.location.href = `/a/${data.slug}`;
      } else {
        setReauditing(false);
      }
    } catch {
      setReauditing(false);
    }
  }

  const canShare = !!result.slug;

  return (
    <header className="sticky top-0 z-30 bg-[var(--background)]/85 backdrop-blur-xl border-b border-foreground/[0.07]">
      <div className="w-[90%] mx-auto h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          {chedderLogo}
          <div className="hidden sm:block w-px h-5 bg-foreground/[0.08]" />
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="text-[13px] text-muted-foreground">Audit for</span>
            <span className="text-[13px] font-semibold text-foreground truncate">{result.domain}</span>
            <span
              className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
              style={{ background: sc.bgLight, color: sc.text }}
            >
              {result.overallScore}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <RecentAuditsMenu currentSlug={result.slug} />
          {canShare && (
            <button
              onClick={onShare}
              className={`h-9 px-3 rounded-lg border text-[13px] font-semibold tracking-[-0.01em] flex items-center gap-1.5 transition-colors ${
                shareCopied
                  ? "bg-[#7a8b6b]/10 border-[#7a8b6b]/30 text-[#52614a]"
                  : "bg-foreground/[0.04] hover:bg-foreground/[0.08] border-foreground/[0.06] text-foreground"
              }`}
              title="Copy shareable URL"
            >
              {shareCopied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                  </svg>
                  <span className="hidden sm:inline">Link copied</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={onReaudit}
            disabled={reauditing}
            className="h-9 px-3 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.06] text-[13px] font-semibold text-foreground tracking-[-0.01em] flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
            title="Re-run this audit to track changes"
          >
            <svg className={`w-3.5 h-3.5 ${reauditing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M23 4v6h-6M1 20v-6h6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span className="hidden sm:inline">{reauditing ? "Re-auditing..." : "Re-audit"}</span>
          </button>
          <button
            onClick={onBack}
            className="h-9 px-3 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.06] text-[13px] font-semibold text-foreground tracking-[-0.01em] flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
            </svg>
            <span className="hidden sm:inline">New audit</span>
          </button>
          {/* TPT lockup intentionally lives in the footer only — keeping
              it out of the top nav so the Chedder mark is the sole
              brand anchor at the top of the page. */}
        </div>
      </div>
    </header>
  );
}

/* ── Document-style hero ─────────────────────────────────────────── */

function AuditHero({ result }: { result: AuditResult }) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.domain)}&sz=128`;
  const sortedModules = [...result.modules].sort((a, b) => a.score - b.score);
  const weakest = sortedModules[0];
  const strongest = sortedModules[sortedModules.length - 1];

  // Derive a short report id from timestamp for document feel
  const reportId = (() => {
    try {
      const t = new Date(result.timestamp).getTime();
      return t.toString(36).toUpperCase().slice(-6);
    } catch {
      return "000000";
    }
  })();

  const date = new Date(result.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  let verdict = "";
  const s = result.overallScore;
  if (s >= 80) verdict = "Well-positioned for AI search";
  else if (s >= 60) verdict = "Foundation in place, opportunity to grow";
  else if (s >= 40) verdict = "Underperforming on AI visibility";
  else verdict = "Largely invisible to AI search";

  return (
    <section className="mt-6 sm:mt-8">
      {/* Quiet audit meta: id + date, right-aligned. The old "REPORT · GEO
          AUDIT" label was technical jargon that didn't earn its space. */}
      <div className="flex items-center justify-end gap-3 pb-3 mb-5 border-b border-foreground/[0.07] text-[11px] font-medium text-muted-foreground/60">
        <span className="tabular-nums">#{reportId}</span>
        <span className="text-muted-foreground/20">·</span>
        <span>{date}</span>
      </div>

      {/* Hero: favicon + title + score */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-10 items-start">
        <div className="flex items-start gap-4 sm:gap-5 min-w-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={faviconUrl}
              alt=""
              className="w-9 h-9 sm:w-10 sm:h-10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-foreground truncate">
              {result.domain}
            </h1>
            <p className="text-[15px] sm:text-[17px] text-muted-foreground tracking-[-0.01em] leading-snug">
              {verdict}
            </p>
            <div className="flex items-center gap-3 pt-1.5 text-[12px] text-muted-foreground/70">
              <span>{result.pagesAudited?.length || 1} page{(result.pagesAudited?.length || 1) > 1 ? "s" : ""} audited</span>
              <span className="text-muted-foreground/25">·</span>
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors truncate max-w-[260px]">
                {result.url.replace(/^https?:\/\//, "")}
              </a>
            </div>
          </div>
        </div>

        {/* Score block */}
        <div className="flex items-stretch gap-4 lg:gap-5">
          <ScoreGauge score={result.overallScore} variant="light" />
          <div className="hidden lg:flex flex-col justify-center gap-3 pr-2 min-w-[140px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">Grade</div>
              <div className="text-[22px] font-semibold tracking-[-0.02em] leading-none mt-1">{result.grade}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">Strongest</div>
              <div className="text-[13px] font-semibold leading-snug mt-0.5 truncate">
                <span className="text-muted-foreground/70 font-medium tabular-nums mr-1">{strongest.score}</span>
                {strongest.name}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">Weakest</div>
              <div className="text-[13px] font-semibold leading-snug mt-0.5 truncate">
                <span className="text-muted-foreground/70 font-medium tabular-nums mr-1">{weakest.score}</span>
                {weakest.name}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── KPI Strip ───────────────────────────────────────────────────── */

function KPIStrip({ result }: { result: AuditResult }) {
  const aiModule = result.modules.find((m) => m.slug === "ai-citations");
  const aiFindings = aiModule?.findings.filter(
    (f) => !f.label.toLowerCase().includes("spend") && !f.label.toLowerCase().includes("query failed")
  ) || [];
  const aiMentions = aiFindings.filter((f) => f.status !== "fail").length;
  const aiTotal = aiFindings.length;

  const allRecs = result.modules.flatMap((m) => m.recommendations);
  const highPriority = allRecs.filter((r) => r.priority === "high").length;

  const aiCompetitorCount = result.aiCompetitors?.length || 0;

  const benchmark = result.benchmarks;
  const hasRank =
    !!benchmark &&
    benchmark.overall.count >= 5 &&
    typeof benchmark.yourPercentile === "number";
  const percentile = benchmark?.yourPercentile ?? 0;
  // "Top X%" phrasing feels stronger when score is good.
  const percentileTop = hasRank ? Math.max(1, 100 - percentile) : 0;
  const percentileColor = !hasRank
    ? "#6f7e94"
    : percentileTop <= 25
      ? "#7a8b6b"
      : percentileTop <= 50
        ? "#c99b66"
        : "#b5443b";

  const rankCard = hasRank
    ? {
        label: "Your Rank",
        value: `Top ${percentileTop}%`,
        sublabel: `of ${benchmark!.overall.count} audited brands`,
        color: percentileColor,
      }
    : {
        label: "Total Findings",
        value: String(result.modules.reduce((acc, m) => acc + m.findings.length, 0)),
        sublabel: "signals analyzed",
        color: "#6f7e94",
      };

  const kpis: Array<{ label: string; value: string; sublabel: string; color: string }> = [
    {
      label: "AI Mention Rate",
      value: aiTotal > 0 ? `${aiMentions}/${aiTotal}` : "·",
      sublabel: aiTotal > 0 ? "queries include you" : "no AI test run",
      color: aiTotal > 0 && aiMentions / aiTotal >= 0.6 ? "#7a8b6b" : aiTotal > 0 && aiMentions / aiTotal >= 0.3 ? "#c99b66" : "#b5443b",
    },
    {
      label: "High-priority Fixes",
      value: String(highPriority),
      sublabel: highPriority === 1 ? "urgent action" : "urgent actions",
      color: highPriority === 0 ? "#7a8b6b" : highPriority <= 2 ? "#c99b66" : "#b5443b",
    },
    rankCard,
    {
      label: "AI Competitors",
      value: String(aiCompetitorCount),
      sublabel: aiCompetitorCount === 1 ? "brand cited instead" : "brands cited instead",
      // Status-aware color matches the rest of the KPI row: 0 = green
      // (nobody named instead), 1-2 = amber (light competition), 3+ =
      // red (loud category). The previous hardcoded pink read as
      // visually disconnected from its siblings.
      color:
        aiCompetitorCount === 0
          ? "#7a8b6b"
          : aiCompetitorCount <= 2
            ? "#c99b66"
            : "#b5443b",
    },
  ];

  return (
    <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="relative p-4 sm:p-5 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, ${k.color}50, ${k.color})` }}
          />
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {k.label}
          </div>
          <div
            className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.03em] leading-none mt-2 tabular-nums"
            style={{ color: k.color }}
          >
            {k.value}
          </div>
          <div className="text-[11px] text-muted-foreground/80 mt-1.5">{k.sublabel}</div>
        </div>
      ))}
    </section>
  );
}

/* ── Tab Nav ─────────────────────────────────────────────────────── */

type TabKey = "overview" | "action" | "deep" | "competitive";

function TabNav({
  active,
  onChange,
  showCompetitive,
  counts,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  showCompetitive: boolean;
  counts: { action: number; deep: number; competitors: number };
}) {
  // Competitive content moved into Overview — was its own tab, but
  // the competitive story IS the Overview story for DTC. Keeping
  // showCompetitive in the signature for backwards compat with any
  // existing wiring; it's just no longer surfaced as a tab.
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "action", label: "Action plan", count: counts.action },
    { key: "deep", label: "Score breakdown", count: counts.deep },
  ];
  void showCompetitive; // intentionally unused now

  return (
    <nav className="mt-8 sm:mt-10 sticky top-14 z-20 bg-[#fafafa]/85 backdrop-blur-xl py-2 -mx-1">
      {/* Pill-style segmented control. Stronger visual weight than the
          underline tabs we had before — active state is a filled white
          pill with a soft shadow, count badges become real pills that
          read as part of the tab. User feedback: tabs needed to draw
          attention. */}
      <div
        className="inline-flex items-center gap-0.5 p-1 rounded-2xl bg-foreground/[0.05] border border-foreground/[0.06] mx-1 overflow-x-auto scrollbar-none max-w-full"
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className={`relative px-3.5 sm:px-4 h-9 flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] whitespace-nowrap rounded-xl transition-all duration-150 ${
                isActive
                  ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-md min-w-[18px] text-center ${
                    isActive
                      ? "bg-foreground text-white"
                      : "bg-foreground/[0.08] text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Radar Chart (module scores) ─────────────────────────────────── */

function RadarChart({ modules }: { modules: ModuleResult[] }) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 115;
  const n = modules.length;
  const step = (2 * Math.PI) / n;
  const start = -Math.PI / 2;

  // Short radar-chart labels. The full module names ("The labels AI
  // reads first", "What the web whispers about you") don't fit the
  // radial layout. Hand-tuned per slug so the axis reads naturally.
  // Plain-language radar axis labels. A DTC founder shouldn't see
  // "Schema" or "Meta" — those are technical terms the audit uses
  // internally but never surfaces in the UI. Each axis gets a friendly
  // 2-3 word version of what the underlying module measures.
  const radarLabel: Record<string, string> = {
    schema: "Page tags",
    meta: "Page summary",
    content: "Content",
    technical: "AI access",
    authority: "Trust",
    external: "Web presence",
    "ai-citations": "AI mentions",
    products: "Products",
  };

  const points = modules.map((m, i) => {
    const angle = start + i * step;
    const r = (m.score / 100) * maxR;
    const outer = maxR;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      ox: cx + Math.cos(angle) * outer,
      oy: cy + Math.sin(angle) * outer,
      lx: cx + Math.cos(angle) * (outer + 30),
      ly: cy + Math.sin(angle) * (outer + 30),
      score: m.score,
      name: radarLabel[m.slug] ?? m.name.slice(0, 12),
      slug: m.slug,
      color: moduleColor(m.slug).accent,
      angle,
    };
  });

  const poly = points.map((p) => `${p.x},${p.y}`).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[420px] mx-auto">
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6f7e94" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#c2745f" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* rings */}
        {rings.map((t, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={maxR * t}
            fill="none"
            stroke="#1f1e1d"
            strokeOpacity={i === rings.length - 1 ? 0.1 : 0.05}
            strokeDasharray={i === rings.length - 1 ? undefined : "2 3"}
          />
        ))}

        {/* spokes */}
        {points.map((p, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.ox}
            y2={p.oy}
            stroke="#1f1e1d"
            strokeOpacity="0.06"
          />
        ))}

        {/* data polygon */}
        <polygon points={poly} fill="url(#radarFill)" stroke="#6f7e94" strokeWidth="1.75" strokeLinejoin="round" />

        {/* score dots */}
        {points.map((p) => (
          <g key={p.slug}>
            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke={p.color} strokeWidth="2.5" />
          </g>
        ))}

        {/* labels — anchor side-based so long labels near the edges
            don't get clipped. Left column uses start-anchor + right-
            shift, right column uses end-anchor + left-shift. */}
        {points.map((p) => {
          const leftEdge = p.lx < cx - 40;
          const rightEdge = p.lx > cx + 40;
          const anchor: "start" | "middle" | "end" = leftEdge
            ? "start"
            : rightEdge
              ? "end"
              : "middle";
          const labelX = leftEdge ? p.lx - 16 : rightEdge ? p.lx + 16 : p.lx;
          return (
            <g key={`l-${p.slug}`}>
              <text
                x={labelX}
                y={p.ly - 5}
                textAnchor={anchor}
                className="text-[10px] font-semibold fill-foreground"
                style={{ letterSpacing: "0.02em", textTransform: "uppercase" }}
              >
                {p.name}
              </text>
              <text
                x={labelX}
                y={p.ly + 8}
                textAnchor={anchor}
                className="text-[13px] font-bold tabular-nums"
                style={{ fill: p.color }}
              >
                {p.score}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Tab content: Overview ───────────────────────────────────────── */

/**
 * Live AI Answers panel.
 *
 * The old "Live AI Test" panel was weak because it just repeated
 * numbers shown elsewhere — score, mention rate, etc. This rebuild
 * does something nothing else on the page does: it surfaces the
 * actual AI quote with the brand name highlighted. The proof, not
 * the metric. Founders see a real chat-style bubble with what AI
 * said about them when a shopper asked.
 *
 * Picks the "best" excerpt to feature:
 *   1. Prefer a "pass" finding (positive mention shows you at best)
 *   2. Otherwise "warn" (mention with caveats)
 *   3. Otherwise "fail" (no-mention with competitor list)
 *   Within each tier, prefer the longest excerpt for more context.
 */
function LiveAITestPanel({ result }: { result: AuditResult }) {
  const aiModule = result.modules.find((m) => m.slug === "ai-citations");
  if (!aiModule) return null;

  const findings = aiModule.findings.filter(
    (f) =>
      !f.label.toLowerCase().includes("spend") &&
      !f.label.toLowerCase().includes("query failed")
  );
  const withExcerpt = findings.filter(
    (f) => f.excerpt && f.excerpt.length > 20
  );

  const passes = findings.filter((f) => f.status === "pass").length;
  const warns = findings.filter((f) => f.status === "warn").length;
  const fails = findings.filter((f) => f.status === "fail").length;
  const total = findings.length;
  const mentions = passes + warns;

  // Pick the best excerpt to feature: pass > warn > fail, longest wins
  const tierOrder: Array<"pass" | "warn" | "fail"> = ["pass", "warn", "fail"];
  const featured = (() => {
    for (const tier of tierOrder) {
      const inTier = withExcerpt
        .filter((f) => f.status === tier)
        .sort((a, b) => (b.excerpt?.length || 0) - (a.excerpt?.length || 0));
      if (inTier.length > 0) return inTier[0];
    }
    return withExcerpt[0] || null;
  })();

  // Pull the scenario (the shopper question) from the finding label
  // (format: "When a shopper asks for X · AI chats")
  const cleanQuestion = featured
    ? featured.label.replace(/\s·\s(AI chats|AI search).*$/i, "")
    : "";
  const channel = featured?.label.match(/(AI chats|AI search)/i)?.[0] || "";
  const featuredStatusColor =
    featured?.status === "pass"
      ? "#7a8b6b"
      : featured?.status === "warn"
        ? "#c99b66"
        : "#b5443b";

  // Strip leading ellipsis/markdown noise from excerpts, trim length
  function cleanExcerpt(raw: string): string {
    let s = raw
      .replace(/^[.…\s]+/, "")
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length > 360) s = s.slice(0, 360).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  // Highlight occurrences of the brand name in the excerpt without
  // dangerouslySetInnerHTML — split on the brand and interleave spans.
  function renderHighlighted(text: string, highlight?: string) {
    if (!highlight || highlight.length < 2) return text;
    const re = new RegExp(
      `(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark
          key={i}
          className="bg-[var(--brand-coral)]/35 text-white font-semibold rounded px-0.5 py-px"
          style={{ backgroundClip: "padding-box" }}
        >
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  }

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#1f1e1d] text-white h-full flex flex-col relative overflow-hidden">
      {/* subtle coral wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-coral)]/[0.08] via-transparent to-transparent pointer-events-none" />
      {/* Header */}
      <div className="relative flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[var(--brand-coral)]/15 border border-[var(--brand-coral)]/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[var(--brand-coral)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
            What AI is saying about you
          </div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">
            {mentions > 0
              ? `Mentioned in ${mentions} of ${total} questions`
              : "Not mentioned in any question"}
          </div>
        </div>
      </div>

      {/* The featured AI quote */}
      {featured ? (
        <div className="relative mt-5 flex-1 flex flex-col">
          {/* Question */}
          <div className="text-[11.5px] text-white/50 mb-2 flex items-center gap-2 flex-wrap">
            <span className="font-semibold uppercase tracking-[0.08em] text-white/45">
              Shopper asked
            </span>
            {channel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.08] text-white/70 font-medium">
                {channel}
              </span>
            )}
          </div>
          <div className="text-[13.5px] text-white/85 leading-snug mb-3 italic">
            &ldquo;{cleanQuestion}?&rdquo;
          </div>

          {/* AI answer bubble */}
          <div className="relative">
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
              style={{ background: featuredStatusColor }}
            />
            <div className="pl-4 pr-1">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/45 mb-1.5">
                AI replied
              </div>
              <p className="text-[14px] leading-[1.55] text-white/90">
                {renderHighlighted(
                  cleanExcerpt(featured.excerpt!),
                  featured.highlight
                )}
              </p>
              {featured.sourceUrl && (
                <a
                  href={featured.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-[11px] text-white/50 hover:text-white/80 transition-colors"
                >
                  Source
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mt-5 flex-1 flex items-center justify-center text-center">
          <p className="text-[13px] text-white/50 leading-snug max-w-[260px]">
            AI didn&apos;t return any quotable answers this run. Re-audit later to
            see what changes.
          </p>
        </div>
      )}

      {/* Bottom stats — compact, smaller than before so the quote is the hero */}
      <div className="relative grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/[0.08]">
        <div className="min-w-0">
          <div className="text-[18px] font-semibold tabular-nums text-[#7a8b6b]">
            {passes}
          </div>
          <div className="text-[9.5px] sm:text-[10px] text-white/40 font-medium uppercase tracking-[0.05em] mt-0.5">
            Top pick
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-semibold tabular-nums text-[#c99b66]">
            {warns}
          </div>
          <div className="text-[9.5px] sm:text-[10px] text-white/40 font-medium uppercase tracking-[0.05em] mt-0.5">
            Also seen
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-semibold tabular-nums text-[#b5443b]">
            {fails}
          </div>
          <div className="text-[9.5px] sm:text-[10px] text-white/40 font-medium uppercase tracking-[0.05em] mt-0.5">
            Missing
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ result }: { result: AuditResult }) {
  const hasHistory = (result.history?.length || 0) >= 1;
  const hasUserCompetitors = !!(
    result.competitors && result.competitors.length > 0
  );
  const hasAICompetitors = (result.aiCompetitors?.length || 0) > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
      {/* HEADLINE: how AI ranks you against the category. The
          competitive story leads the Overview because it's what DTC
          founders open the audit to learn. */}
      {hasAICompetitors && (
        <div className="lg:col-span-12">
          <CompetitivePicturePanel result={result} />
        </div>
      )}

      {/* User-defined competitor comparison (only when they ran a
          compare audit with explicit competitor URLs) */}
      {hasUserCompetitors && (
        <div className="lg:col-span-12">
          <CompetitorComparison
            primary={result}
            competitors={result.competitors!}
          />
        </div>
      )}

      {/* AI-named competitor detail panel with the "audit these too"
          conversion CTA. Was on its own tab; promoted here so the
          competitive view is all in one place. */}
      {hasAICompetitors && (
        <div className="lg:col-span-12">
          <AICompetitors result={result} competitors={result.aiCompetitors} />
        </div>
      )}

      {/* Where show up / don't — full width */}
      <div className="lg:col-span-12">
        <WhereResults result={result} />
      </div>

      {/* Where AI sends people (marketplace shadow analysis) — full
          width, only when we have citation data */}
      {result.destinations && result.destinations.totalCitations > 0 && (
        <div className="lg:col-span-12">
          <DestinationsPanel destinations={result.destinations} />
        </div>
      )}

      {/* Performance over time — full width, only when we have history */}
      {hasHistory && (
        <div className="lg:col-span-12">
          <HistoryTimeline result={result} />
        </div>
      )}

      {/* Radar + live AI test panel */}
      <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Your signal shape</h3>
            <p className="text-[12px] text-muted-foreground">How AI sees your brand across {result.modules.length} different signals</p>
          </div>
        </div>
        <RadarChart modules={result.modules} />
      </div>

      <div className="lg:col-span-5">
        <LiveAITestPanel result={result} />
      </div>
    </div>
  );
}

/* ── History timeline / performance over time ────────────────────── */

/**
 * Where AI sends people. Classified breakdown of every URL cited
 * across all AI engine answers — own site vs. marketplace vs.
 * competitor vs. publisher vs. community vs. review vs. knowledge.
 *
 * The headline at the top is the single most actionable framing of
 * the breakdown, generated server-side based on whichever kind
 * dominates. Below: a stacked horizontal bar and a top-domains list.
 */
/**
 * Competitive picture — the headline panel of the audit Overview.
 *
 * Surfaces "where you sit vs the brands AI recommends in your category"
 * as a single, immediately-readable view. Mention rate per brand,
 * AI-quoted prices when we have them, your row highlighted.
 *
 * Designed for a DTC founder who has 30 seconds. The answer to
 * "am I winning the AI category" should be visible without reading.
 */
function CompetitivePicturePanel({ result }: { result: AuditResult }) {
  // Build the roster: you + every competitor AI named, ranked by how
  // many distinct AI engines mentioned them. The audited brand counts
  // its own AI-mention score (the ai-citations module).
  const aiModule = result.modules.find((m) => m.slug === "ai-citations");
  const aiCompetitors = result.aiCompetitors || [];
  const brandPrices = result.brandPrices || [];

  // Estimate audited brand's "mentions" from the ai-citations module.
  // The module score is 0-100; we map to a 0-N pseudo-mention scale so
  // the bar comparison reads sensibly against competitor mention counts.
  // Not exact, but close enough for the visual ranking.
  const maxCompetitorMentions = Math.max(
    1,
    ...aiCompetitors.map((c) => c.mentions)
  );
  const yourScore = aiModule?.score ?? 0;
  // Heuristic: a brand with 80+ AI visibility ≈ as visible as the most-
  // mentioned competitor; a brand with 0 is invisible. Linear scale.
  const yourPseudoMentions = Math.max(
    0,
    Math.round((yourScore / 80) * maxCompetitorMentions)
  );

  type Row = {
    isYou: boolean;
    domain: string;
    mentions: number;
    prices: string[];
    sampleQuery?: string;
  };

  const rows: Row[] = [
    {
      isYou: true,
      domain: result.domain,
      mentions: yourPseudoMentions,
      prices: brandPrices,
    },
    ...aiCompetitors.map((c) => ({
      isYou: false,
      domain: c.domain,
      mentions: c.mentions,
      prices: c.prices || [],
      sampleQuery: c.queries[0],
    })),
  ];
  rows.sort((a, b) => b.mentions - a.mentions);

  const yourRank = rows.findIndex((r) => r.isYou) + 1;
  const maxMentions = Math.max(1, ...rows.map((r) => r.mentions));

  // Build the headline sentence — the single most important thing the
  // founder needs to read. Adapts to where they actually sit.
  let headline: string;
  if (yourRank === 1) {
    headline = `You're the #1 brand AI mentions in this category. ${
      rows.length - 1
    } competitors trail you.`;
  } else if (yourPseudoMentions === 0) {
    headline = `AI doesn't mention you at all. It recommends ${
      rows.length - 1
    } other brand${rows.length - 1 === 1 ? "" : "s"} in your category instead.`;
  } else {
    const ahead = rows.slice(0, yourRank - 1).map((r) => r.domain);
    const aheadLabel =
      ahead.length === 1
        ? ahead[0]
        : `${ahead.slice(0, 2).join(", ")}${
            ahead.length > 2
              ? ` and ${ahead.length - 2} other${ahead.length - 2 === 1 ? "" : "s"}`
              : ""
          }`;
    const verb = ahead.length === 1 ? "comes" : "come";
    headline = `AI ranks you #${yourRank} of ${rows.length} brands in your category. ${aheadLabel} ${verb} up first.`;
  }

  // Price range summary across all brands, when we have any prices
  const allPrices: number[] = [];
  for (const r of rows) {
    for (const p of r.prices) {
      const n = parseFloat(p.replace(/[^\d.]/g, ""));
      if (!Number.isNaN(n)) allPrices.push(n);
    }
  }
  let priceSummary: string | null = null;
  if (allPrices.length >= 2) {
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const symbol = (rows.find((r) => r.prices.length > 0)?.prices[0] || "$").charAt(0);
    priceSummary = `AI quotes prices in this category from ${symbol}${formatPrice(min)} to ${symbol}${formatPrice(max)}.`;
  }

  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">
          Where you sit in your category
        </h3>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">
          AI named {rows.length - 1} competitor{rows.length - 1 === 1 ? "" : "s"} alongside you
        </span>
      </div>
      <p className="text-[13.5px] text-foreground/85 leading-[1.55] mb-1">
        {headline}
      </p>
      {priceSummary && (
        <p className="text-[12.5px] text-muted-foreground leading-[1.5] mb-4">
          {priceSummary}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const widthPct = Math.max(2, (row.mentions / maxMentions) * 100);
          return (
            <div
              key={row.domain + (row.isYou ? ":you" : "")}
              className={`relative flex items-center gap-3 p-3 rounded-xl transition-colors ${
                row.isYou
                  ? "bg-[#d8a23e]/[0.08] border border-[#d8a23e]/40"
                  : "bg-foreground/[0.02] border border-transparent"
              }`}
            >
              {/* Rank number */}
              <div
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums ${
                  row.isYou
                    ? "bg-[#1f1e1d] text-white"
                    : "bg-foreground/[0.06] text-foreground/60"
                }`}
              >
                {rows.indexOf(row) + 1}
              </div>

              {/* Brand + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={`font-mono truncate ${
                        row.isYou
                          ? "text-[14px] font-semibold text-foreground"
                          : "text-[13px] text-foreground/85"
                      }`}
                    >
                      {row.domain}
                    </span>
                    {row.isYou && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#d8a23e] flex-shrink-0">
                        you
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {row.prices.length > 0 && (
                      <span className="text-[12px] text-foreground/75 tabular-nums">
                        {row.prices.slice(0, 2).join(" · ")}
                      </span>
                    )}
                    <span className="text-[11.5px] text-muted-foreground tabular-nums">
                      {row.mentions === 0
                        ? "not mentioned"
                        : `${row.mentions} mention${row.mentions === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${widthPct}%`,
                      background: row.isYou
                        ? "linear-gradient(90deg, #d8a23e, #b58632)"
                        : "linear-gradient(90deg, #8b8b90, #6b6b70)",
                      transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n % 1 === 0) return String(n);
  return n.toFixed(2);
}

function DestinationsPanel({
  destinations,
}: {
  destinations: DestinationAnalysis;
}) {
  const { totalCitations, byKind, topDomains, headline } = destinations;
  // Sort the stacked bar by importance to the brand owner:
  // own → marketplace → competitor → publisher → community → review → knowledge → other
  const bandOrder: DestinationKind[] = [
    "own",
    "marketplace",
    "competitor",
    "publisher",
    "community",
    "review",
    "knowledge",
    "other",
  ];
  const orderedBands = bandOrder
    .map((k) => byKind.find((b) => b.kind === k))
    .filter((b): b is (typeof byKind)[number] => !!b && b.count > 0);

  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">
          Where AI sends your customers
        </h3>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">
          {totalCitations} citation{totalCitations === 1 ? "" : "s"} analyzed
        </span>
      </div>
      <p className="text-[13px] text-foreground/80 leading-[1.55] mb-4">
        {headline}
      </p>

      {/* Stacked horizontal share bar */}
      <div className="flex w-full h-3 rounded-full overflow-hidden bg-foreground/[0.04]">
        {orderedBands.map((b) => (
          <div
            key={b.kind}
            style={{
              width: `${Math.max(1.5, b.share * 100)}%`,
              background: destinationKindColor(b.kind as DestinationKind),
            }}
            title={`${destinationKindLabel(b.kind as DestinationKind)}: ${b.count} (${Math.round(b.share * 100)}%)`}
          />
        ))}
      </div>

      {/* Legend with counts */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {orderedBands.map((b) => (
          <div key={b.kind} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: destinationKindColor(b.kind as DestinationKind) }}
            />
            <span className="text-foreground/80">
              {destinationKindLabel(b.kind as DestinationKind)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {b.count}
              <span className="text-muted-foreground/70 ml-1">
                ({Math.round(b.share * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Top destinations table */}
      {topDomains.length > 0 && (
        <div className="mt-5 pt-4 border-t border-foreground/[0.07]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 mb-2">
            Top destinations AI links to
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {topDomains.slice(0, 8).map((d) => (
              <div
                key={`${d.kind}-${d.domain}`}
                className="flex items-center justify-between text-[13px] py-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: destinationKindColor(d.kind as DestinationKind),
                    }}
                  />
                  <a
                    href={`https://${d.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-foreground/85 hover:text-[#6f8aab] hover:underline truncate"
                  >
                    {d.domain}
                  </a>
                </div>
                <span className="text-foreground font-semibold tabular-nums text-[12.5px]">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function HistoryTimeline({ result }: { result: AuditResult }) {
  const history = result.history || [];
  // Oldest first for the chart
  const ordered = [...history].reverse();
  // Include the current audit at the end
  const allPoints = [
    ...ordered.map((h) => ({
      slug: h.slug,
      ts: h.timestamp,
      score: h.overallScore,
      isCurrent: false,
    })),
    { slug: result.slug || "current", ts: result.timestamp, score: result.overallScore, isCurrent: true },
  ];

  const latestPrevious = history[0]; // most recent prior audit
  const delta = latestPrevious ? result.overallScore - latestPrevious.overallScore : 0;
  const deltaColor = delta > 0 ? "#52614a" : delta < 0 ? "#b5443b" : "#6e6e73";

  // SVG sparkline
  const w = 560;
  const h = 90;
  const padX = 12;
  const padY = 14;
  const xStep = allPoints.length > 1 ? (w - padX * 2) / (allPoints.length - 1) : 0;
  const yScale = (s: number) => padY + ((100 - s) / 100) * (h - padY * 2);
  const pts = allPoints.map((p, i) => ({ x: padX + i * xStep, y: yScale(p.score), ...p }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${(padX + (allPoints.length - 1) * xStep).toFixed(1)},${(h - padY).toFixed(1)} L${padX},${(h - padY).toFixed(1)} Z`;

  // Find biggest per-module movers since the last audit
  let biggestGain: { slug: string; delta: number } | null = null;
  let biggestLoss: { slug: string; delta: number } | null = null;
  if (latestPrevious) {
    for (const m of result.modules) {
      const prev = latestPrevious.moduleScores[m.slug];
      if (typeof prev !== "number") continue;
      const d = m.score - prev;
      if (biggestGain === null || d > biggestGain.delta) biggestGain = { slug: m.slug, delta: d };
      if (biggestLoss === null || d < biggestLoss.delta) biggestLoss = { slug: m.slug, delta: d };
    }
  }

  const moduleName = (slug: string) => result.modules.find((m) => m.slug === slug)?.name || slug;

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Performance over time</h3>
          <p className="text-[12px] text-muted-foreground">
            {history.length + 1} audit{history.length === 0 ? "" : "s"} for {result.domain}
          </p>
        </div>
        {latestPrevious && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Since last audit</span>
            <span className="font-semibold tabular-nums" style={{ color: deltaColor }}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          </div>
        )}
      </div>

      {/* Sparkline — capped width so the trend line reads properly on
          wide screens. The previous preserveAspectRatio="none" stretched
          a 560×90 viewBox to 1500px wide on desktop, flattening the
          line visually even when there were real audit-to-audit swings. */}
      <div className="relative max-w-[720px] mx-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]">
          <defs>
            <linearGradient id="histArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6f7e94" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6f7e94" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 50-line */}
          <line
            x1={padX}
            y1={yScale(50)}
            x2={w - padX}
            y2={yScale(50)}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="3,3"
          />
          <path d={areaPath} fill="url(#histArea)" />
          <path d={linePath} fill="none" stroke="#6f7e94" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={p.isCurrent ? 5 : 3.5}
                fill={p.isCurrent ? "#6f7e94" : "#fff"}
                stroke="#6f7e94"
                strokeWidth={p.isCurrent ? 2 : 2}
              />
              <title>
                {new Date(p.ts).toLocaleDateString()} · {p.score}
              </title>
            </g>
          ))}
        </svg>
      </div>

      {/* Movers */}
      {latestPrevious && biggestGain && biggestLoss && (biggestGain.delta !== 0 || biggestLoss.delta !== 0) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {biggestGain.delta > 0 && (
            <div className="p-3 rounded-xl bg-[#7a8b6b]/[0.06] border border-[#7a8b6b]/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#52614a]">Biggest gain</div>
              <div className="mt-1 text-[14px] font-semibold leading-snug">
                <span className="tabular-nums text-[#52614a] mr-1.5">
                  +{biggestGain.delta}
                </span>
                <span className="text-foreground/80 font-medium">
                  {moduleName(biggestGain.slug)}
                </span>
              </div>
            </div>
          )}
          {biggestLoss.delta < 0 && (
            <div className="p-3 rounded-xl bg-[#b5443b]/[0.06] border border-[#b5443b]/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b5443b]">Regression</div>
              <div className="mt-1 text-[14px] font-semibold leading-snug">
                <span className="tabular-nums text-[#b5443b] mr-1.5">
                  {biggestLoss.delta}
                </span>
                <span className="text-foreground/80 font-medium">
                  {moduleName(biggestLoss.slug)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tab content: Action Plan ────────────────────────────────────── */

function ActionTab({ result }: { result: AuditResult }) {
  return (
    <div className="max-w-[920px]">
      <ActionPlan result={result} />
    </div>
  );
}

/* ── Tab content: Deep Dive ──────────────────────────────────────── */

/**
 * Three plain-language categories that group the 8 signal modules.
 * User feedback: the previous flat grid of 8 cards each with its own
 * abstract description felt confusing and wordy. Founders couldn't
 * tell what each module was for. Each category here is phrased as
 * the actual question a founder is asking — "can AI find me", "does
 * AI trust me", "does AI mention me" — and the modules sit beneath
 * the question they answer.
 */
const SCORE_CATEGORIES: Array<{
  key: string;
  title: string;
  blurb: string;
  slugs: string[];
}> = [
  {
    key: "findable",
    title: "Can AI find you?",
    blurb: "The basics that determine whether AI tools can read your site at all.",
    slugs: ["technical", "schema", "meta", "content"],
  },
  {
    key: "trusted",
    title: "Does AI trust you?",
    blurb: "Signals AI weighs when deciding whether your brand is worth recommending.",
    slugs: ["authority", "products", "external"],
  },
  {
    key: "cited",
    title: "Does AI actually mention you?",
    blurb: "The bottom line: when shoppers ask AI, do you come up?",
    slugs: ["ai-citations"],
  },
];

function DeepDiveTab({ result }: { result: AuditResult }) {
  const moduleBySlug = new Map(result.modules.map((m) => [m.slug, m]));

  return (
    <div className="space-y-8">
      {SCORE_CATEGORIES.map((cat) => {
        const mods = cat.slugs
          .map((s) => moduleBySlug.get(s))
          .filter((m): m is ModuleResult => !!m);
        if (mods.length === 0) return null;
        const avg = Math.round(
          mods.reduce((sum, m) => sum + m.score, 0) / mods.length
        );
        const catColor =
          avg >= 70 ? "#7a8b6b" : avg >= 40 ? "#c99b66" : "#b5443b";
        return (
          <section key={cat.key}>
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
              <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                {cat.title}
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{ color: catColor }}
                >
                  {avg}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  average across {mods.length} signal{mods.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground leading-snug mb-3">
              {cat.blurb}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {mods.map((m) => {
                const bench = result.benchmarks?.modules?.[m.slug];
                return (
                  <ModuleCard
                    key={m.slug}
                    module={m}
                    benchmark={
                      bench
                        ? { median: bench.median, count: bench.count }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── Tab content: Competitive ────────────────────────────────────── */

function CompetitiveTab({
  result,
  hasUserCompetitors,
  hasAICompetitors,
}: {
  result: AuditResult;
  hasUserCompetitors: boolean;
  hasAICompetitors: boolean;
}) {
  return (
    <div className="space-y-8">
      {hasUserCompetitors && (
        <CompetitorComparison primary={result} competitors={result.competitors!} />
      )}
      {hasAICompetitors && (
        <AICompetitors result={result} competitors={result.aiCompetitors} />
      )}
    </div>
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
  const [tab, setTab] = useState<TabKey>("overview");

  const hasUserCompetitors = !!(result.competitors && result.competitors.length > 0);
  const hasAICompetitors = !!(result.aiCompetitors && result.aiCompetitors.length > 0);
  const showCompetitive = hasUserCompetitors || hasAICompetitors;

  const counts = {
    action: result.modules.reduce((acc, m) => acc + m.recommendations.length, 0),
    deep: result.modules.length,
    competitors: (result.competitors?.length || 0) + (result.aiCompetitors?.length || 0),
  };

  return (
    <div className="flex-1 min-h-screen bg-[#fafafa]">
      {/* Sticky app chrome */}
      <AppChrome result={result} onBack={onBack} />

      <div className="w-[90%] mx-auto pb-28">
        {/* Document-style hero */}
        <AuditHero result={result} />

        {/* KPI strip */}
        <KPIStrip result={result} />

        {/* Tabbed workspace */}
        <TabNav active={tab} onChange={setTab} showCompetitive={showCompetitive} counts={counts} />

        <div className="mt-6 sm:mt-8">
          {tab === "overview" && <OverviewTab result={result} />}
          {tab === "action" && <ActionTab result={result} />}
          {tab === "deep" && <DeepDiveTab result={result} />}
          {/* "competitive" tab key kept reachable via deep links but
              its content now lives inside Overview. If the URL still
              points here, fall back to Overview. */}
          {tab === "competitive" && <OverviewTab result={result} />}
        </div>

        {/* Meta info always accessible at bottom */}
        <div className="mt-12">
          <MetaInfo result={result} />
        </div>
      </div>

      {/* Floating download popup */}
      <ChatPopup result={result} />

      {/* Footer */}
      <footer className="text-center pb-10 pt-6 border-t border-foreground/[0.06]">
        <a
          href="https://twopointtechnologies.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 group mt-6"
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

/* ── Meta Info (pages + methodology, compact) ────────────────────── */

function MetaInfo({ result }: { result: AuditResult }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 py-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors border-t border-foreground/[0.06]"
      >
        <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3 text-left min-w-0">
          <span className="font-medium">Audit details &amp; methodology</span>
          <span className="text-[12px] text-muted-foreground/50">
            {result.pagesAudited?.length || 1} page{(result.pagesAudited?.length || 1) > 1 ? "s" : ""} &middot; {new Date(result.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </span>
        <svg className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
            Chedder checks the things AI tools use to decide who to recommend: your site's structure, meta tags, content quality, whether AI crawlers can read you, and your trust signals. We also run real shopper questions through AI chats and AI search, and check whether you show up on Wikipedia and Reddit. A full strategy also involves link building and broader brand monitoring, which this audit doesn't cover.
          </div>
        </div>
      )}
    </section>
  );
}
