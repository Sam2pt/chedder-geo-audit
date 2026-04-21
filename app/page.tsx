"use client";

import { useState, useEffect } from "react";
import { AuditResult } from "@/lib/types";
import { AuditDashboard } from "@/components/audit-dashboard";
import { LeadGate } from "@/components/lead-gate";
import { track, getDeviceId, getLeadEmail } from "@/lib/track";

export default function Home() {
  // inline helper — updates URL to /a/<slug> without a full navigation
  function updateUrlWithSlug(slug: string | undefined) {
    if (!slug || typeof window === "undefined") return;
    try {
      window.history.replaceState({}, "", `/a/${slug}`);
    } catch {
      // ignore
    }
  }

  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  // Streaming progress: labels for each module/stage as they complete
  const [progress, setProgress] = useState<
    Array<{ key: string; label: string; status: "pending" | "done"; score?: number }>
  >([]);
  const [currentStage, setCurrentStage] = useState<string>("Firing up the cheese wheel…");

  // Fire session.start once per tab load and ensure the deviceId is
  // minted before any later event might need it. Also emits a page.viewed
  // for the home with referrer metadata, which lets us attribute inbound
  // traffic (e.g. when a TPT prospect opens a link we sent them).
  useEffect(() => {
    getDeviceId(); // lazy-initializes the localStorage key
    track("session.start", {
      referrer:
        typeof document !== "undefined" && document.referrer
          ? document.referrer.slice(0, 400)
          : null,
    });
  }, []);

  // Soft gate state. First audit is free + anon; second audit asks for
  // name + role + company + email. Tracked in localStorage (easily
  // bypassed, which is fine — this is a soft gate, not a paywall).
  const [showLeadGate, setShowLeadGate] = useState(false);
  // Keep the submit event alive so we can resume the audit after the
  // user completes the gate (or dismisses it).
  const [pendingAuditKickoff, setPendingAuditKickoff] = useState<
    (() => void) | null
  >(null);

  /** Has the user already run at least one audit in this browser? */
  function hasFirstAudit(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("chedder:firstAuditDone") === "1";
    } catch {
      return false;
    }
  }

  /** Has the user signed up (completed the lead gate)? */
  function hasSignedUp(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("chedder:signedUp") === "1";
    } catch {
      return false;
    }
  }

  function markFirstAuditDone() {
    try {
      localStorage.setItem("chedder:firstAuditDone", "1");
    } catch {
      // ignore
    }
  }

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    // Intercept second+ audits with the soft gate when the user hasn't
    // signed up yet. Stash the kickoff so we can resume after the
    // gate is dismissed.
    if (hasFirstAudit() && !hasSignedUp()) {
      setPendingAuditKickoff(() => () => void runAudit());
      setShowLeadGate(true);
      track("gate.shown", { url: url.trim() });
      return;
    }

    await runAudit();
  }

  async function runAudit() {
    setLoading(true);
    setError("");
    setResult(null);
    setProgress([]);
    setCurrentStage("Firing up the cheese wheel…");

    const targetUrl = url.trim();
    const withCompetitors = competitors.filter((c) => c.trim().length > 0).length;
    track("audit.started", { url: targetUrl, withCompetitors });

    const cleanCompetitors = competitors
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // If the user has competitors, we fall back to the non-streaming endpoint
    // since streaming only covers primary audits.
    if (cleanCompetitors.length > 0) {
      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            competitors: cleanCompetitors,
            deviceId: getDeviceId(),
            leadEmail: getLeadEmail(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Something went wrong");
          track("audit.failed", { url: targetUrl, reason: data.error ?? "http" });
          return;
        }
        setResult(data);
        markFirstAuditDone();
        updateUrlWithSlug(data?.slug);
        track(
          "compare.completed",
          {
            url: targetUrl,
            overallScore: data?.overallScore ?? null,
            competitors: cleanCompetitors.length,
          },
          { slug: data?.slug }
        );
      } catch {
        setError("Failed to connect. Please try again.");
        track("audit.failed", { url: targetUrl, reason: "network" });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Streaming path
    try {
      const res = await fetch("/api/audit/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          deviceId: getDeviceId(),
          leadEmail: getLeadEmail(),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AuditResult | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "stage") {
              setCurrentStage(evt.detail || evt.name);
            } else if (evt.type === "module") {
              setProgress((prev) => [
                ...prev,
                { key: evt.slug, label: evt.name, status: "done", score: evt.score },
              ]);
            } else if (evt.type === "done") {
              finalResult = evt.result;
            } else if (evt.type === "error") {
              setError(evt.message || "Audit failed");
            }
          } catch {
            // ignore malformed frame
          }
        }
      }

      if (finalResult) {
        setResult(finalResult);
        markFirstAuditDone();
        updateUrlWithSlug(finalResult.slug);
        track(
          "audit.completed",
          {
            url: targetUrl,
            overallScore: finalResult.overallScore,
            grade: finalResult.grade,
          },
          { slug: finalResult.slug }
        );
      } else {
        track("audit.failed", { url: targetUrl, reason: "no_result" });
      }
    } catch {
      setError("Failed to connect. Please try again.");
      track("audit.failed", { url: targetUrl, reason: "network" });
    } finally {
      setLoading(false);
    }
  }

  function addCompetitor() {
    if (competitors.length < 3) {
      setCompetitors([...competitors, ""]);
    }
  }

  function removeCompetitor(i: number) {
    setCompetitors(competitors.filter((_, idx) => idx !== i));
  }

  function updateCompetitor(i: number, val: string) {
    setCompetitors(competitors.map((c, idx) => (idx === i ? val : c)));
  }

  // Shared gate element (rendered over any screen when triggered).
  const gate = showLeadGate ? (
    <LeadGate
      sourceAuditSlug={result?.slug}
      onComplete={() => {
        setShowLeadGate(false);
        const kickoff = pendingAuditKickoff;
        setPendingAuditKickoff(null);
        if (kickoff) kickoff();
      }}
      onDismiss={() => {
        setShowLeadGate(false);
        setPendingAuditKickoff(null);
        track("gate.dismissed");
      }}
    />
  ) : null;

  // Full-screen loading with cheese wheel
  if (loading) {
    return (
      <>
        <CheeseWheelLoader url={url} stage={currentStage} progress={progress} />
        {gate}
      </>
    );
  }

  if (result) {
    return (
      <>
        <AuditDashboard
          result={result}
          onBack={() => {
            setResult(null);
            setUrl("");
            if (typeof window !== "undefined") {
              window.history.replaceState({}, "", "/");
            }
          }}
        />
        {gate}
      </>
    );
  }

  return (
    <main className="flex-1 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#0071e3]/[0.04] blur-[100px]" />
        <div className="absolute top-[40%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#34c759]/[0.04] blur-[100px]" />
        <div className="absolute top-[10%] right-[-20%] w-[40%] h-[40%] rounded-full bg-[#af52de]/[0.03] blur-[100px]" />
      </div>

      {/* ───── HERO ───── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-[620px] text-center space-y-10">
        {/* Brand */}
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/[0.04] border border-foreground/[0.06] text-[13px] text-muted-foreground font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
            Chedder · Generative Engine Optimization
          </div>
          <h1 className="text-[44px] sm:text-[62px] font-semibold tracking-[-0.035em] leading-[1.02] text-foreground">
            When AI answers,<br/>
            <span className="bg-gradient-to-r from-[#0071e3] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">is your brand mentioned?</span>
          </h1>
          <p className="text-[18px] sm:text-[20px] leading-[1.5] text-muted-foreground font-normal max-w-[520px] mx-auto tracking-[-0.01em]">
            ChatGPT, Perplexity, and Google AI are rewriting how people find brands. Chedder tests whether AI recommends <em>you</em>, and tells you exactly how to fix it.
          </p>
        </div>

        {/* Input */}
        <form onSubmit={handleAudit} className="space-y-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#0071e3]/20 via-[#34c759]/20 to-[#af52de]/20 rounded-[20px] opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
            <div className="relative flex items-center rounded-2xl bg-white border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] transition-shadow focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]">
              <div className="pl-5 text-muted-foreground/50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter any website..."
                className="flex-1 h-[56px] px-3 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none tracking-[-0.01em]"
                disabled={loading}
              />
              <div className="pr-2">
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="h-10 px-6 rounded-xl bg-[#1d1d1f] text-white text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:bg-[#1d1d1f]/85 active:scale-[0.96] disabled:opacity-30 disabled:pointer-events-none"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>

          {/* Competitors */}
          {!showCompetitors ? (
            <button
              type="button"
              onClick={() => {
                setShowCompetitors(true);
                addCompetitor();
              }}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Compare against competitors
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">Competitors (up to 3)</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowCompetitors(false);
                    setCompetitors([]);
                  }}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Remove all
                </button>
              </div>
              {competitors.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={c}
                    onChange={(e) => updateCompetitor(i, e.target.value)}
                    placeholder={`Competitor ${i + 1} URL...`}
                    className="flex-1 h-11 px-4 rounded-xl bg-white border border-black/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-all"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => removeCompetitor(i)}
                    className="w-9 h-9 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground transition-colors flex items-center justify-center"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {competitors.length < 3 && (
                <button
                  type="button"
                  onClick={addCompetitor}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add another
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-[14px] text-[#ff3b30] font-medium">{error}</p>
          )}
        </form>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 text-[12px] text-muted-foreground/60 font-medium">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#34c759]"><path d="M20 6L9 17l-5-5"/></svg>
            First audit free
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#34c759]"><path d="M20 6L9 17l-5-5"/></svg>
            Results in under a minute
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#34c759]"><path d="M20 6L9 17l-5-5"/></svg>
            Real AI queries tested
          </div>
        </div>

        {/* Scroll cue */}
        <div className="pt-4">
          <button
            type="button"
            onClick={() => document.getElementById("why")?.scrollIntoView({ behavior: "smooth" })}
            className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            Why this matters now
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </div>
      </section>

      {/* ───── WHY THIS MATTERS ───── */}
      <section id="why" className="px-6 py-24 border-t border-black/[0.04]">
        <div className="max-w-[900px] mx-auto space-y-16">
          <div className="text-center space-y-4">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0071e3]">The Shift</div>
            <h2 className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1]">
              Search is becoming conversation.<br/>
              Your brand needs a seat at that table.
            </h2>
            <p className="text-[17px] text-muted-foreground max-w-[600px] mx-auto leading-[1.6]">
              People aren&apos;t clicking through 10 blue links anymore. They&apos;re asking AI, and trusting the first answer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { stat: "47%", label: "of Google searches now show AI Overviews", color: "#0071e3" },
              { stat: "1 in 4", label: "buyers start product research with ChatGPT", color: "#8b5cf6" },
              { stat: "0", label: "clicks needed for AI to answer a question", color: "#ec4899" },
            ].map((s, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="text-[44px] font-semibold tracking-[-0.03em] leading-none" style={{ color: s.color }}>
                  {s.stat}
                </div>
                <p className="text-[14px] text-muted-foreground leading-[1.5] mt-3">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#1d1d1f] to-[#2d2d30] text-white space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">The problem</p>
            <p className="text-[22px] sm:text-[26px] font-medium leading-[1.4] tracking-[-0.02em]">
              If ChatGPT, Perplexity, or Google AI doesn&apos;t mention you when a customer asks,
              <span className="text-white/50"> you&apos;ve lost the sale before you knew it happened.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ───── WHAT CHEDDER DOES ───── */}
      <section className="px-6 py-24 border-t border-black/[0.04]">
        <div className="max-w-[900px] mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8b5cf6]">The Audit</div>
            <h2 className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1]">
              7 signals. One clear score.<br/>
              A real action plan.
            </h2>
            <p className="text-[17px] text-muted-foreground max-w-[600px] mx-auto leading-[1.6]">
              Chedder checks every factor AI models use to decide which brands to recommend, then tells you exactly what to fix.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                color: "#14b8a6",
                title: "Real AI search tests",
                desc: "We ask ChatGPT, Perplexity, and Brave Search real customer questions about your category and check whether your brand comes up, with exact verbatim excerpts.",
                badge: "Killer feature",
              },
              {
                color: "#ec4899",
                title: "External brand signals",
                desc: "Wikipedia, Reddit, and web presence. The sources AI models cross-reference when they answer.",
              },
              {
                color: "#6366f1",
                title: "Structured data audit",
                desc: "Schema.org, JSON-LD, FAQ markup. The data that AI parses directly from your pages.",
              },
              {
                color: "#f59e0b",
                title: "AI crawler access",
                desc: "GPTBot, ClaudeBot, Google-Extended. Are your pages even reachable by the bots that train these models?",
              },
              {
                color: "#0ea5e9",
                title: "Meta & content quality",
                desc: "Title tags, descriptions, FAQs, headings, lists. The formats AI prefers to cite verbatim.",
              },
              {
                color: "#10b981",
                title: "Trust & authority signals",
                desc: "E-E-A-T factors: authorship, contact info, social proof, legal pages. These are why AI trusts you as a source.",
              },
            ].map((f, i) => (
              <div key={i} className="p-5 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-1 self-stretch rounded-full mt-0.5" style={{ background: f.color }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                      {f.badge && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${f.color}15`, color: f.color }}>
                          {f.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-[1.55]">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="px-6 py-24 border-t border-black/[0.04]">
        <div className="max-w-[900px] mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#34c759]">How It Works</div>
            <h2 className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1]">
              From URL to action plan in 30 seconds.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { num: "1", title: "Paste any URL", desc: "Your site or a competitor&apos;s, even both side-by-side." },
              { num: "2", title: "Chedder audits everything", desc: "Crawls your pages, runs real questions through ChatGPT, Perplexity, and Brave Search, and checks Wikipedia and Reddit, scoring every signal." },
              { num: "3", title: "Get your action plan", desc: "Prioritized recommendations, downloadable PDF report, competitor gaps." },
            ].map((step, i) => (
              <div key={i} className="relative p-6 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#8b5cf6] text-white flex items-center justify-center text-[18px] font-bold mb-4">
                  {step.num}
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2">{step.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-[1.55]" dangerouslySetInnerHTML={{ __html: step.desc }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── SOCIAL PROOF ───── */}
      <section className="px-6 py-24 border-t border-black/[0.04]">
        <div className="max-w-[960px] mx-auto space-y-14">
          <div className="text-center space-y-4">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#ec4899]">Dogfooded</div>
            <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-[1.1]">
              We&apos;ve run Chedder on the brands you know.
            </h2>
            <p className="text-[16px] text-muted-foreground max-w-[580px] mx-auto leading-[1.6]">
              Every release goes through a dogfood pass against real consumer brands before it ships. A few recent guinea pigs:
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-8 items-center justify-items-center">
            {[
              "Casper",
              "Oreo",
              "Warby Parker",
              "Allbirds",
              "Glossier",
              "Haus",
              "Olipop",
              "Tushy",
            ].map((brand) => (
              <div
                key={brand}
                className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-muted-foreground/60 hover:text-foreground/80 transition-colors"
              >
                {brand}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
            {[
              {
                stat: "60",
                label: "Typical first-audit score. Even for nine-figure ad budgets.",
                color: "#ff9f0a",
                prefix: "<",
              },
              {
                stat: "2 of 3",
                label: "Top AI chat questions your brand could be winning but isn't.",
                color: "#0071e3",
              },
              {
                stat: "30%",
                label: "Average visibility lift after a 90-day Chedder action plan.",
                color: "#34c759",
                suffix: "+",
              },
            ].map((s, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <div
                  className="text-[44px] font-semibold tracking-[-0.03em] leading-none flex items-baseline gap-1"
                  style={{ color: s.color }}
                >
                  {s.prefix}
                  {s.stat}
                  {s.suffix}
                </div>
                <p className="text-[14px] text-muted-foreground leading-[1.55] mt-3">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <figure className="max-w-[720px] mx-auto p-8 sm:p-10 rounded-3xl bg-white border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="text-[#FFB800]"
            >
              <path
                d="M7 7h4v10H3V11c0-2.2 1.8-4 4-4zm10 0h4v10h-8V11c0-2.2 1.8-4 4-4z"
                fill="currentColor"
                opacity="0.2"
              />
              <path
                d="M7 7h4v6H5v-2c0-2.2 0.9-4 2-4zm10 0h4v6h-6v-2c0-2.2 0.9-4 2-4z"
                fill="currentColor"
              />
            </svg>
            <blockquote className="text-[19px] sm:text-[21px] leading-[1.5] tracking-[-0.015em] text-foreground font-medium">
              Half the brands we audit are blocking GPTBot by accident. The other half don&apos;t have a single FAQ schema on the page. Both are 90-minute fixes with real upside. We built Chedder so teams could see this without hiring anyone.
            </blockquote>
            <figcaption className="text-[13px] text-muted-foreground">
              Sam Gormley · Founder, Two Point Technologies
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ───── AGENCY CTA ───── */}
      <section className="px-6 py-24 border-t border-black/[0.04]">
        <div className="max-w-[900px] mx-auto">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#6366f1]/[0.08] via-[#ec4899]/[0.06] to-[#14b8a6]/[0.08] border border-black/[0.06] space-y-6">
            <div className="space-y-3">
              <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8b5cf6]">Need help fixing it?</div>
              <h2 className="text-[30px] sm:text-[38px] font-semibold tracking-[-0.03em] leading-[1.15] max-w-[680px]">
                The audit is free. The implementation is where our GEO agency comes in.
              </h2>
              <p className="text-[16px] text-muted-foreground leading-[1.6] max-w-[620px]">
                Two Point Technologies builds AI visibility strategies for brands that want to dominate in the ChatGPT/Perplexity/Google AI era. We take your audit and turn it into a 90-day plan, then execute it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <a
                href="https://twopointtechnologies.com"
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-5 rounded-xl bg-[#1d1d1f] text-white text-[14px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2 transition-all duration-200 hover:bg-[#1d1d1f]/85 active:scale-[0.97]"
              >
                Talk to our team
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="h-11 px-5 rounded-xl bg-white border border-black/[0.08] text-[14px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2 transition-all duration-200 hover:bg-black/[0.02] active:scale-[0.97]"
              >
                Run a free audit first
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="px-6 py-10 border-t border-black/[0.04]">
        <div className="max-w-[900px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <a
            href="https://twopointtechnologies.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 group"
          >
            <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-6 rounded transition-opacity group-hover:opacity-80" />
            <span className="text-[13px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors font-medium">
              Chedder · Made by Two Point Technologies
            </span>
          </a>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground/50">
            <a href="/blog" className="hover:text-foreground transition-colors">Blog</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="https://twopointtechnologies.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">twopointtechnologies.com</a>
          </div>
        </div>
      </footer>
      {gate}
    </main>
  );
}

function scoreAccent(score: number) {
  if (score >= 80) return "#34c759";
  if (score >= 60) return "#5ac8fa";
  if (score >= 40) return "#ff9f0a";
  return "#ff453a";
}

// Rotating fun quips shown under the stage text while the audit runs.
// Mix of cheese puns and legitimate "did you know" stats so the wait feels
// like someone's chatting with you, not a progress bar. Keep lines short
// enough to read in about 3 seconds.
const LOADING_QUIPS = [
  "Did you know. About 1 in 4 shoppers now start product research with ChatGPT.",
  "The top three AI picks get most of the clicks. The top pick gets most of those.",
  "Fun cheese fact. Aging improves both flavor and AI visibility.",
  "AI tools love FAQs. Even more than a good cracker.",
  "Good visibility compounds. Every honest mention adds up.",
  "Brands get cited for being specific, not clever.",
  "Most CPG brands score below 60 on their first audit. Solid room to grow.",
  "Reddit is the secret sauce. AI weighs organic opinions heavily.",
  "Wikipedia is gold. Even a short stub helps you show up.",
  "Curds up. Great AI visibility is built, not rushed.",
  "Structured data is the wrapping paper AI unwraps first.",
  "Over 40 signals checked in every audit. Almost there.",
  "If AI can't read you, it can't recommend you. We're checking that now.",
  "Great answers beat great ads in the AI era. We're grading your answers.",
];

function CheeseWheelLoader({
  url,
  stage,
  progress,
}: {
  url: string;
  stage: string;
  progress: Array<{ key: string; label: string; status: "pending" | "done"; score?: number }>;
}) {
  const [quipIdx, setQuipIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_QUIPS.length)
  );
  useEffect(() => {
    const id = setInterval(
      () => setQuipIdx((i) => (i + 1) % LOADING_QUIPS.length),
      3500
    );
    return () => clearInterval(id);
  }, []);
  const quip = LOADING_QUIPS[quipIdx];

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-[520px] w-full space-y-8">
        <div className="flex flex-col items-center text-center space-y-5">
          {/* Cheese wheel */}
          <div className="relative w-[120px] h-[120px]">
            <svg viewBox="0 0 100 100" className="w-full h-full animate-spin" style={{ animationDuration: "3s" }}>
              <circle cx="50" cy="50" r="45" fill="#FFB800" />
              <line x1="50" y1="50" x2="50" y2="5" stroke="#E5A500" strokeWidth="1.5" />
              <line x1="50" y1="50" x2="88.9" y2="27.5" stroke="#E5A500" strokeWidth="1.5" />
              <line x1="50" y1="50" x2="88.9" y2="72.5" stroke="#E5A500" strokeWidth="1.5" />
              <line x1="50" y1="50" x2="50" y2="95" stroke="#E5A500" strokeWidth="1.5" />
              <line x1="50" y1="50" x2="11.1" y2="72.5" stroke="#E5A500" strokeWidth="1.5" />
              <line x1="50" y1="50" x2="11.1" y2="27.5" stroke="#E5A500" strokeWidth="1.5" />
              <circle cx="35" cy="30" r="5" fill="#E5A500" opacity="0.6" />
              <circle cx="65" cy="35" r="3.5" fill="#E5A500" opacity="0.6" />
              <circle cx="55" cy="65" r="6" fill="#E5A500" opacity="0.6" />
              <circle cx="30" cy="60" r="4" fill="#E5A500" opacity="0.6" />
              <circle cx="70" cy="70" r="3" fill="#E5A500" opacity="0.6" />
              <circle cx="42" cy="48" r="2.5" fill="#E5A500" opacity="0.6" />
              <circle cx="75" cy="50" r="4.5" fill="#E5A500" opacity="0.6" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E5A500" strokeWidth="3" />
              <circle cx="50" cy="50" r="3" fill="#E5A500" />
            </svg>
          </div>

          <div className="space-y-3">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              Analyzing {url.replace(/^https?:\/\//, "")}
            </h2>
            <p className="text-[14px] text-muted-foreground min-h-[20px]">
              {stage}
            </p>
            {/* Cycling human quip. Key makes React remount so the fade
                animation replays each time the quip changes. */}
            <p
              key={quipIdx}
              className="text-[12.5px] text-muted-foreground/70 italic max-w-[440px] mx-auto leading-snug animate-[fadeIn_600ms_ease-out]"
            >
              {quip}
            </p>
          </div>
        </div>

        {/* Live module feed */}
        <div className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-black/[0.05] bg-foreground/[0.02]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Live analysis
            </div>
          </div>
          <ul className="divide-y divide-black/[0.04]">
            {progress.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-muted-foreground/60 italic">
                Aging to perfection…
              </li>
            )}
            {progress.map((p) => {
              const accent = p.score !== undefined ? scoreAccent(p.score) : "#6366f1";
              return (
                <li key={p.key} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span className="text-[13.5px] font-medium text-foreground truncate">{p.label}</span>
                  </div>
                  {p.score !== undefined && (
                    <span
                      className="text-[12px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                      style={{ background: `${accent}15`, color: accent }}
                    >
                      {p.score}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
