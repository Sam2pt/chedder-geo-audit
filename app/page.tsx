"use client";

import { useState, useEffect, useRef } from "react";
import { AuditResult } from "@/lib/types";
import { AuditDashboard } from "@/components/audit-dashboard";
import { LeadGate } from "@/components/lead-gate";
import { UpgradeModal } from "@/components/upgrade-modal";
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
  // Pro-gate modal — opens when a signed-in free user tries to run a
  // second+ audit and the server returns 402 upgrade_required.
  const [showUpgrade, setShowUpgrade] = useState(false);
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
          // 402 = upgrade required from /api/audit. Open Pro modal.
          if (res.status === 402 || data?.code === "upgrade_required") {
            track("audit.gated", { url: targetUrl, plan: data?.plan ?? "unknown" });
            setShowUpgrade(true);
            return;
          }
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
        // 402 = upgrade required. Show the Pro modal instead of the
        // generic error banner so the moment is converting, not failing.
        if (res.status === 402 || data?.code === "upgrade_required") {
          track("audit.gated", { url: targetUrl, plan: data?.plan ?? "unknown" });
          setShowUpgrade(true);
          setLoading(false);
          return;
        }
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

  // Pro-gate modal, mounted alongside the lead-gate so it overlays
  // whatever screen the user is on when the 402 hits.
  const upgrade = (
    <UpgradeModal
      open={showUpgrade}
      reason="audit_limit"
      onClose={() => setShowUpgrade(false)}
    />
  );

  // Full-screen loading with cheese wheel
  if (loading) {
    return (
      <>
        <CheeseWheelLoader url={url} stage={currentStage} progress={progress} />
        {gate}
        {upgrade}
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
        {upgrade}
      </>
    );
  }

  return (
    <main className="flex-1 relative overflow-hidden">
      {/* Cool electric wash. Two soft indigo/cyan blurs sit behind
          the hero. The grid texture used to extend across the whole
          page which made every content section feel busy; now the
          radial mask fades it out aggressively past the hero so the
          sections below render against a clean background. */}
      <div className="absolute top-0 left-0 right-0 h-[900px] -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-25%] left-[10%] w-[55%] h-[55%] rounded-full bg-[var(--brand-coral)]/[0.08] blur-[140px]" />
        <div className="absolute top-[-10%] right-[5%] w-[40%] h-[50%] rounded-full bg-[var(--brand-accent-2)]/[0.06] blur-[140px]" />
        {/* Grid texture — narrower mask so it stays in the top quadrant
            and doesn't compete with section content below. */}
        <div className="absolute inset-0 opacity-[0.022]" style={{
          backgroundImage: "linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 25%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 25%, black 30%, transparent 75%)"
        }} />
      </div>

      {/* Top nav with sign-in / my-audits affordance */}
      <TopNav />

      {/* ───── HERO ───── */}
      <section className="min-h-[90vh] sm:min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-12 sm:py-20">
      <div className="w-full max-w-[760px] text-center space-y-10">
        {/* Brand */}
        <div className="space-y-6">
          <div className="anim-fade-in inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm border border-foreground/[0.07] text-[12.5px] text-muted-foreground font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
            The complete GEO audit for DTC brands
          </div>
          {/* Two-block poster: now-fact (line one) + binary question
              (line two). Font sized so both blocks fit comfortably
              inside the 760px hero container without overflow — at
              72px the headlines were ~860px wide on desktop, wider
              than the container and the search-bar below it, which
              made the hero feel 'all over the place'. 56px on desktop
              lets each block sit on a single line inside the column;
              34px on mobile lets lines wrap naturally. */}
          <h1 className="anim-slide-up text-[34px] sm:text-[56px] font-semibold tracking-[-0.04em] sm:tracking-[-0.045em] leading-[1.05] sm:leading-[1.02] text-foreground">
            <span className="block">Your next customer just asked AI.</span>
            <span className="block mt-2 sm:mt-3">
              <span className="text-foreground/35">Did it pick </span>
              <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">your brand</span>
              <span className="text-foreground/35">?</span>
            </span>
          </h1>
          <p className="anim-slide-up delay-100 text-[15.5px] sm:text-[20px] leading-[1.5] text-muted-foreground font-normal max-w-[560px] mx-auto tracking-[-0.005em] sm:tracking-[-0.01em]">
            Chedder runs the exact questions shoppers ask ChatGPT, Perplexity, and Google. See if you show up, where AI sends them, and the specific fixes when you don&apos;t.
          </p>
        </div>

        {/* Input. On mobile the Analyze button stacks below the field
            so it never looks like a floating pill inside the search bar
            at narrow widths. From sm: up, button slots inside the bar. */}
        <form onSubmit={handleAudit} className="anim-slide-up delay-200 space-y-4">
          <div className="relative group">
            {/* Single coral halo on focus — replaces the tri-color rainbow.
                pointer-events-none so the halo never intercepts taps on
                the mobile Analyze button that sits below it. */}
            <div className="absolute -inset-0.5 bg-[var(--brand-coral)]/15 rounded-[20px] opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-md pointer-events-none" />
            <div className="relative flex items-center rounded-2xl bg-white border border-foreground/[0.08] shadow-[0_1px_3px_rgba(31,30,29,0.04),0_4px_16px_rgba(31,30,29,0.03)] transition-all duration-300 focus-within:border-[var(--brand-coral)]/40 focus-within:shadow-[0_2px_10px_rgba(217,119,87,0.08),0_10px_32px_rgba(31,30,29,0.05)]">
              <div className="pl-5 text-muted-foreground/50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <input
                // Mobile UX hardening:
                //  type=text (NOT type=url) — type=url triggers HTML5
                //    native validation that requires a scheme like https://,
                //    which rejects 'casper.com' before our server can add it.
                //    inputMode below still gives us the URL keyboard.
                //  inputMode=url shows the URL-optimized keyboard (with /, .)
                //  autoCapitalize=none prevents iOS turning the first letter uppercase
                //  autoCorrect/spellCheck=off stops 'casper.com' becoming 'capper.com'
                //  enterKeyHint=go relabels the keyboard's Return key to 'Go' so users
                //    can submit from the keyboard without finding the on-screen button
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Your DTC brand's website..."
                className="flex-1 min-w-0 h-[56px] px-3 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none tracking-[-0.01em]"
                disabled={loading}
              />
              {/* Desktop-only inline submit (hidden on mobile) */}
              <div className="hidden sm:block pr-2">
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="h-10 px-6 rounded-xl bg-[#0f172a] text-white text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:bg-[#0f172a]/85 active:scale-[0.96] disabled:opacity-30 disabled:pointer-events-none"
                >
                  Analyze
                </button>
              </div>
            </div>
            {/* Mobile-only stacked submit (full width, sits right below the input bar) */}
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="sm:hidden mt-2.5 w-full h-12 rounded-2xl bg-[#0f172a] text-white text-[15px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:bg-[#0f172a]/85 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none"
            >
              Analyze
            </button>
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
                    className="flex-1 h-11 px-4 rounded-xl bg-white border border-foreground/[0.09] text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-all"
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
            <p className="text-[14px] text-[#c44a3a] font-medium">{error}</p>
          )}
        </form>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 text-[12px] text-muted-foreground/60 font-medium">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3d8b5e]"><path d="M20 6L9 17l-5-5"/></svg>
            Built for DTC
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3d8b5e]"><path d="M20 6L9 17l-5-5"/></svg>
            First audit free
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3d8b5e]"><path d="M20 6L9 17l-5-5"/></svg>
            Real shopper questions tested
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
      <section id="why" className="px-6 py-12 sm:py-20 border-t border-foreground/[0.06]">
        <div className="max-w-[900px] mx-auto space-y-16">
          <div className="text-center space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral-dark)]">The Shift</div>
            <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.04em] leading-[1.05]">
              Search is becoming conversation.<br/>
              Your brand needs a seat at that table.
            </h2>
            <p className="text-[17px] text-muted-foreground max-w-[600px] mx-auto leading-[1.6]">
              People aren&apos;t clicking through 10 blue links anymore. They&apos;re asking AI, and trusting the first answer.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { stat: "47%", label: "of Google searches now show AI Overviews" },
              { stat: "1 in 4", label: "DTC shoppers start product research with ChatGPT" },
              { stat: "0", label: "clicks needed for AI to pick a brand for them" },
            ].map((s, i) => (
              <div key={i} className="anim-slide-up p-5 sm:p-7 rounded-2xl bg-white/70 backdrop-blur-sm border border-foreground/[0.06] hover:border-foreground/[0.12] hover:bg-white transition-all duration-300" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="text-[32px] sm:text-[52px] font-semibold tracking-[-0.045em] leading-none text-foreground tabular-nums">
                  {s.stat}
                </div>
                <p className="text-[11.5px] sm:text-[13.5px] text-muted-foreground leading-[1.45] sm:leading-[1.55] mt-3 sm:mt-4">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="anim-slide-up p-8 sm:p-12 rounded-3xl bg-[#0f172a] text-white space-y-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-coral)]/[0.08] to-transparent pointer-events-none" />
            <p className="relative text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral)]">The problem</p>
            <p className="relative text-[22px] sm:text-[30px] font-semibold leading-[1.25] tracking-[-0.025em]">
              If ChatGPT, Perplexity, or Google AI doesn&apos;t mention you when a customer asks,
              <span className="text-white/45 font-medium"> you&apos;ve lost the sale before you knew it happened.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ───── WHAT CHEDDER DOES ───── */}
      <section className="px-6 py-10 sm:py-18 border-t border-foreground/[0.06]">
        <div className="max-w-[900px] mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral-dark)]">The Audit</div>
            <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.04em] leading-[1.05]">
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
                title: "Real AI search tests",
                desc: "We ask ChatGPT, Perplexity, and Brave Search real customer questions about your category and check whether your brand comes up, with exact verbatim excerpts.",
                badge: "Killer feature",
              },
              {
                title: "External brand signals",
                desc: "Wikipedia, Reddit, and web presence. The sources AI models cross-reference when they answer.",
              },
              {
                title: "Structured data audit",
                desc: "Schema.org, JSON-LD, FAQ markup. The data that AI parses directly from your pages.",
              },
              {
                title: "AI crawler access",
                desc: "GPTBot, ClaudeBot, Google-Extended. Are your pages even reachable by the bots that train these models?",
              },
              {
                title: "Meta & content quality",
                desc: "Title tags, descriptions, FAQs, headings, lists. The formats AI prefers to cite verbatim.",
              },
              {
                title: "Trust & authority signals",
                desc: "E-E-A-T factors: authorship, contact info, social proof, legal pages. These are why AI trusts you as a source.",
              },
            ].map((f, i) => (
              <div key={i} className="anim-slide-up-sm p-5 sm:p-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-foreground/[0.06] hover:border-foreground/[0.12] hover:bg-white hover:-translate-y-0.5 transition-all duration-300" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15.5px] font-semibold tracking-[-0.012em] text-foreground">{f.title}</h3>
                    {f.badge && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[var(--brand-coral)]/10 text-[var(--brand-coral-dark)]">
                        {f.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-[1.6]">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="px-6 py-10 sm:py-18 border-t border-foreground/[0.06]">
        <div className="max-w-[900px] mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral-dark)]">How It Works</div>
            <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.04em] leading-[1.05]">
              From URL to action plan in under a minute.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { num: "1", title: "Paste any URL", desc: "Your site or a competitor&apos;s, even both side-by-side." },
              { num: "2", title: "Chedder audits everything", desc: "Crawls your pages, runs real questions through ChatGPT, Perplexity, and Brave Search, and checks Wikipedia and Reddit, scoring every signal." },
              { num: "3", title: "Get your action plan", desc: "Prioritized recommendations, downloadable PDF report, competitor gaps." },
            ].map((step, i) => (
              <div key={i} className="relative p-6 rounded-2xl bg-white border border-foreground/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--brand-coral)]/10 text-[var(--brand-coral-dark)] flex items-center justify-center text-[14px] font-semibold mb-4 border border-[var(--brand-coral)]/20 tabular-nums tracking-[-0.01em]">
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
      <section className="px-6 py-10 sm:py-18 border-t border-foreground/[0.06]">
        <div className="max-w-[960px] mx-auto space-y-14">
          <div className="text-center space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral-dark)]">Built for DTC</div>
            <h2 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.04em] leading-[1.05]">
              For the brands shoppers ask AI about.
            </h2>
            <p className="text-[16px] text-muted-foreground max-w-[580px] mx-auto leading-[1.6]">
              Chedder is tuned for direct-to-consumer. Not B2B SaaS, not enterprise tools, not agencies. Just the brands shoppers actually buy. Categories we&apos;re good at:
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center max-w-[640px] mx-auto">
            {[
              "Mattresses",
              "Pet food",
              "Dog beds",
              "Beauty",
              "Chocolate",
              "Beverages",
              "Detergent",
              "Candles",
              "Supplements",
              "Skincare",
              "Coffee",
              "Apparel",
            ].map((category) => (
              <div
                key={category}
                className="px-3.5 py-1.5 rounded-full bg-white border border-foreground/[0.09] text-[13px] font-medium text-foreground/70"
              >
                {category}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-6">
            {[
              {
                stat: "60",
                label: "Typical first-audit score for DTC brands. Even ones with nine-figure ad budgets.",
                prefix: "<",
              },
              {
                stat: "1 in 2",
                label: "DTC brands we audit are blocking GPTBot or ClaudeBot by accident.",
              },
              {
                stat: "40",
                label: "Signals scored per audit, including marketplace shadow analysis.",
                suffix: "+",
              },
            ].map((s, i) => (
              <div
                key={i}
                className="anim-slide-up p-5 sm:p-7 rounded-2xl bg-white/70 backdrop-blur-sm border border-foreground/[0.06] hover:border-foreground/[0.12] hover:bg-white transition-all duration-300"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="text-[30px] sm:text-[50px] font-semibold tracking-[-0.045em] leading-none flex items-baseline gap-[1px] sm:gap-1 text-foreground tabular-nums">
                  {s.prefix}
                  {s.stat}
                  {s.suffix}
                </div>
                <p className="text-[11.5px] sm:text-[13.5px] text-muted-foreground leading-[1.45] sm:leading-[1.6] mt-3 sm:mt-4">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <figure className="max-w-[720px] mx-auto p-8 sm:p-10 rounded-3xl bg-white border border-foreground/[0.07] shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="text-[#d8a23e]"
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
      <section className="px-6 py-10 sm:py-18 border-t border-foreground/[0.06]">
        <div className="max-w-[900px] mx-auto">
          <div className="p-8 sm:p-12 rounded-3xl bg-[var(--brand-coral)]/[0.04] border border-[var(--brand-coral)]/[0.15] space-y-6">
            <div className="space-y-3">
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral-dark)]">Need help fixing it?</div>
              <h2 className="text-[30px] sm:text-[42px] font-semibold tracking-[-0.04em] leading-[1.1] max-w-[680px]">
                The audit is free. The implementation is where our GEO agency comes in.
              </h2>
              <p className="text-[16px] text-muted-foreground leading-[1.6] max-w-[620px]">
                Two Point Technologies builds AI visibility strategies for DTC brands that want to own their category in the ChatGPT/Perplexity era. We take your Chedder audit and turn it into a 90-day plan, then execute it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <a
                href="https://twopointtechnologies.com"
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-5 rounded-xl bg-[#0f172a] text-white text-[14px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2 transition-all duration-200 hover:bg-[#0f172a]/85 active:scale-[0.97]"
              >
                Talk to our team
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="h-11 px-5 rounded-xl bg-white border border-foreground/[0.09] text-[14px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2 transition-all duration-200 hover:bg-foreground/[0.03] active:scale-[0.97]"
              >
                Run a free audit first
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="px-6 py-10 border-t border-foreground/[0.06]">
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
            <a href="/sign-in" className="hover:text-foreground transition-colors">Sign in</a>
            <a href="/blog" className="hover:text-foreground transition-colors">Blog</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="https://twopointtechnologies.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">twopointtechnologies.com</a>
          </div>
        </div>
      </footer>
      {gate}
        {upgrade}
    </main>
  );
}

/**
 * Small fixed top nav. Fetches /api/auth/me once on mount and swaps
 * "Sign in" for "My audits" once the user has a session.
 */
function TopNav() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.email) setEmail(d.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <nav className="absolute top-0 left-0 right-0 z-20 px-6 py-4 flex items-center justify-between">
      <a href="/" className="inline-flex items-center gap-2 group">
        {/* Refined cheese mark: a wheel with one slice cut, which also
            reads as the letter C. Gold gradient gives depth; two small
            asymmetric holes keep the cheese identity without clutter. */}
        <svg viewBox="0 0 100 100" className="w-7 h-7 transition-transform duration-500 group-hover:rotate-[-8deg]">
          <defs>
            <linearGradient id="cheddTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0c46e" />
              <stop offset="55%" stopColor="#e0a740" />
              <stop offset="100%" stopColor="#a87a25" />
            </linearGradient>
          </defs>
          <path
            d="M 50 50 L 91.6 32.8 A 45 45 0 1 1 67.2 8.4 Z"
            fill="url(#cheddTop)"
            stroke="#0f172a"
            strokeOpacity="0.08"
            strokeWidth="1.2"
          />
          <circle cx="32" cy="48" r="4.2" fill="#0f172a" opacity="0.2" />
          <circle cx="45" cy="68" r="2.8" fill="#0f172a" opacity="0.2" />
        </svg>
        <span className="text-[15px] font-semibold tracking-[-0.025em] text-foreground/85 group-hover:text-foreground transition-colors">Chedder</span>
      </a>
      <div className="flex items-center gap-2">
        {email ? (
          <a
            href="/my-audits"
            className="h-9 px-3.5 rounded-lg bg-foreground text-background text-[13px] font-semibold tracking-[-0.01em] inline-flex items-center gap-1.5 hover:bg-foreground/90 transition-colors"
          >
            My audits
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        ) : (
          <a
            href="/sign-in"
            className="h-9 px-3.5 rounded-lg bg-white border border-foreground/[0.09] text-[13px] font-medium text-foreground/80 hover:text-foreground hover:bg-foreground/[0.03] transition-colors inline-flex items-center"
          >
            Sign in
          </a>
        )}
      </div>
    </nav>
  );
}

function scoreAccent(score: number) {
  if (score >= 80) return "#3d8b5e";
  if (score >= 60) return "#6f8aab";
  if (score >= 40) return "#d89c3a";
  return "#c44a3a";
}

// Rotating fun quips shown under the stage text while the audit runs.
// All DTC-flavored so the wait reinforces "this is built for me" rather
// than reading like generic SEO trivia. Mix of stats, cheese puns, and
// real observations from dogfooding ~200 DTC audits. Keep lines short
// enough to read in about 3 seconds.
const LOADING_QUIPS = [
  "Did you know. About 1 in 4 DTC shoppers now start product research with ChatGPT.",
  "The top three AI picks get most of the clicks. The top pick gets most of those.",
  "Half the DTC brands we audit are blocking GPTBot by accident. We're checking yours now.",
  "AI reads your reviews before your hero image. Make sure they're there.",
  "Your product page schema is doing more work than your TikTok.",
  "Fun cheese fact. Aging improves both flavor and AI visibility.",
  "AI tools love FAQs. Even more than a good cracker.",
  "Most DTC brands score below 60 on their first audit. Solid room to grow.",
  "Reddit is the secret sauce. AI weighs organic shopper opinions heavily.",
  "Wikipedia is gold. Even a short stub helps you show up.",
  "Curds up. Great AI visibility is built, not rushed.",
  "Brands get cited for being specific, not clever.",
  "If AI sends shoppers to Amazon instead of your site, you keep the order but lose the customer.",
  "Founder story pages are GEO content. AI loves a 'why we built this.'",
  "Structured data is the wrapping paper AI unwraps first.",
  "Over 40 signals checked in every audit. Almost there.",
  "If AI can't read you, it can't recommend you. We're checking that now.",
];

/**
 * Audit loading screen. Designed around the principle that the user's
 * eye should rest on ONE indicator — the progress bar — and everything
 * else (cheese wheel, stage text, quip, module feed) should sit quietly
 * around it.
 *
 * Progress is the max of:
 *   • time-based estimate against an expected 45s audit, slowed past 90%
 *     so we don't claim "done" before the server actually finishes
 *   • module-based actual: each of the 7 modules that comes back pushes
 *     the bar forward (so fast brands feel fast)
 *
 * On a typical brand the bar reaches ~95% around 40s; the last 5% sits
 * tight until the audit redirects. The user said it best: the main job
 * is to show passing time and how long is left.
 */
const EXPECTED_AUDIT_MS = 45_000;
// Most DTC brands trigger all 8 modules (schema, meta, content,
// technical, authority, products, external, ai-citations). Non-DTC
// sites without product pages skip the products module — the loader's
// module-progress override just sees 7 modules instead of 8, which
// makes the bar fill slightly faster. Either way the worst-case time
// bound is governed by EXPECTED_AUDIT_MS, not module count.
const TOTAL_MODULES = 8;

function CheeseWheelLoader({
  url,
  stage,
  progress,
}: {
  url: string;
  stage: string;
  progress: Array<{ key: string; label: string; status: "pending" | "done"; score?: number }>;
}) {
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [quipIdx, setQuipIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_QUIPS.length)
  );

  // Tick every 250ms — smooth enough for the bar, cheap enough for state
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Slower quip rotation (was 3.5s, now 8s) — user feedback
  useEffect(() => {
    const id = setInterval(
      () => setQuipIdx((i) => (i + 1) % LOADING_QUIPS.length),
      8000
    );
    return () => clearInterval(id);
  }, []);
  const quip = LOADING_QUIPS[quipIdx];

  // Time-based progress, slowing dramatically past 90% so we never hit
  // 100% before the server says we're done
  const rawTimePct = (elapsed / EXPECTED_AUDIT_MS) * 100;
  const timePct =
    rawTimePct < 90 ? rawTimePct : 90 + Math.min(8, (rawTimePct - 90) * 0.15);

  // Module-based progress: each completed module is worth ~13% of the bar
  const modulePct = Math.min(95, (progress.length / TOTAL_MODULES) * 95);

  // Take whichever is further along. Cap at 99 — only the final
  // "result is ready" event should push us to 100%.
  const pct = Math.min(99, Math.max(timePct, modulePct));

  const remainingMs = Math.max(0, EXPECTED_AUDIT_MS - elapsed);
  const remainingLabel =
    remainingMs > 1000
      ? `About ${Math.ceil(remainingMs / 1000)}s remaining`
      : "Almost there…";

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-[520px] w-full space-y-7">
        <div className="flex flex-col items-center text-center space-y-4">
          {/* The brand C-mark, spinning. Same shape as the logo so the
              loader IS the brand identity — clean and confident, not
              the chunky 7-hole spinner of before. Indigo ambient halo
              behind to tie into the futuristic palette. */}
          <div className="relative w-[76px] h-[76px]">
            <div className="absolute inset-0 rounded-full bg-[var(--brand-coral)]/15 blur-[18px]" />
            <svg viewBox="0 0 100 100" className="relative w-full h-full animate-spin" style={{ animationDuration: "4.5s" }}>
              <defs>
                <linearGradient id="cheddLoader" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0c46e" />
                  <stop offset="55%" stopColor="#e0a740" />
                  <stop offset="100%" stopColor="#a87a25" />
                </linearGradient>
              </defs>
              <path
                d="M 50 50 L 91.6 32.8 A 45 45 0 1 1 67.2 8.4 Z"
                fill="url(#cheddLoader)"
                stroke="#0f172a"
                strokeOpacity="0.1"
                strokeWidth="1.4"
              />
              <circle cx="32" cy="48" r="4.5" fill="#0f172a" opacity="0.22" />
              <circle cx="45" cy="68" r="3" fill="#0f172a" opacity="0.22" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              Analyzing {url.replace(/^https?:\/\//, "")}
            </h2>
            <p className="text-[13.5px] text-muted-foreground min-h-[18px]">
              {stage}
            </p>
          </div>
        </div>

        {/* Main indicator: time-based progress bar with elapsed/remaining */}
        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand-coral)] relative overflow-hidden"
              style={{
                width: `${pct}%`,
                transition: "width 800ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* subtle inner highlight sheen */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground/80 tabular-nums tracking-[-0.005em]">
            <span>{Math.round(pct)}%</span>
            <span>{remainingLabel}</span>
          </div>
        </div>

        {/* Live module feed — quieter than before: no card chrome, just a
            slim list with a divider line above. Still useful because it
            shows real scores landing as analyzers complete. */}
        <div className="border-t border-foreground/[0.07] pt-3">
          <ul className="space-y-2">
            {progress.length === 0 && (
              <li className="text-[12.5px] text-muted-foreground/60 italic text-center py-2">
                Warming up the analyzers…
              </li>
            )}
            {progress.map((p) => {
              const accent = p.score !== undefined ? scoreAccent(p.score) : "#6f7e94";
              return (
                <li key={p.key} className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span className="text-[13px] text-foreground/85 truncate">{p.label}</span>
                  </div>
                  {p.score !== undefined && (
                    <span
                      className="text-[11.5px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
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

        {/* Quip — slow rotation, smaller and dimmer so it reads as
            ambient context rather than the main message. */}
        <p
          key={quipIdx}
          className="text-[12px] text-muted-foreground/60 italic text-center max-w-[440px] mx-auto leading-snug animate-[fadeIn_900ms_ease-out]"
        >
          {quip}
        </p>
      </div>
    </main>
  );
}
