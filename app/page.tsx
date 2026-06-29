"use client";

import { useState, useEffect, useRef } from "react";
import { AuditResult } from "@/lib/types";
import { AuditDashboard } from "@/components/audit-dashboard";
import { UpgradeModal } from "@/components/upgrade-modal";
import { Spark } from "@/components/spark";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";
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
    // Prefill the audit URL from ?url=<encoded> — used by the brand
    // landing pages (/brand/[slug]) to deep-link straight into an
    // audit on a specific domain. We strip the query param after
    // applying so the URL bar stays clean if the user reloads.
    if (typeof window !== "undefined") {
      try {
        const sp = new URLSearchParams(window.location.search);
        const prefill = sp.get("url");
        if (prefill) {
          setUrl(prefill);
          sp.delete("url");
          const next = sp.toString();
          window.history.replaceState(
            {},
            "",
            next ? `${window.location.pathname}?${next}` : window.location.pathname
          );
          track("audit.url.prefilled", { url: prefill });
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Pro-gate modal — opens when the user attempts a 2nd+ audit (either
  // from the client-side hasFirstAudit() flag or a 402 upgrade_required
  // response from /api/audit/stream). Replaces the old LeadGate which
  // captured name/role/company/email — now it's a direct pay path.
  const [showUpgrade, setShowUpgrade] = useState(false);

  /** Has the user already run at least one audit in this browser? */
  function hasFirstAudit(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("chedder:firstAuditDone") === "1";
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

    // Second audit attempt → go STRAIGHT to Stripe Checkout. No
    // intermediate modal, no signup form — Stripe collects the email
    // during payment and the webhook creates the Pro user record from
    // it. The only client-side signal we need is the hasFirstAudit()
    // localStorage flag; server-side 402 in /api/audit/stream still
    // gates signed-in users as a defense-in-depth. The upgrade modal
    // sticks around as a fallback if /api/billing/checkout itself
    // 503s (e.g. Stripe env vars not configured yet).
    if (hasFirstAudit()) {
      track("upgrade.checkout.direct", {
        source: "client_gate",
        url: url.trim(),
      });
      setLoading(true);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: "monthly" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.url) {
          window.location.href = data.url as string;
          return;
        }
        // Stripe not configured, already-Pro, or some other failure —
        // fall back to the modal so the user has a path forward.
        setLoading(false);
        setShowUpgrade(true);
      } catch {
        setLoading(false);
        setShowUpgrade(true);
      }
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

  // Pro-gate modal — rendered globally so it overlays whatever screen
  // the user is on when either the client-side hasFirstAudit() check
  // or a server-side 402 fires.
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
      <section className="min-h-[88vh] sm:min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-16 sm:py-20 relative">
      <div className="w-full max-w-[760px] text-center space-y-8">
        {/* Intro pill — short, naming both acronyms so search-savvy
            visitors recognize what we do immediately. */}
        <div className="anim-fade-in inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-foreground/[0.07] text-[12px] text-muted-foreground font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
          GEO + AEO audit for DTC and CPG brands
        </div>

        {/* Chedder introduces themselves — Spark at hero scale with
            ambient blink and bounce, then headline below. The visual
            establishes the character as the brand before any copy
            does. */}
        <div className="relative flex justify-center pt-2 pb-1">
          <div className="absolute inset-0 -m-8 bg-[var(--brand-coral)]/12 blur-3xl rounded-full -z-10" />
          <Spark variant="idle" animate size={120} className="anim-fade-in" />
        </div>

        <div className="space-y-5">
          <h1 className="anim-slide-up text-[36px] sm:text-[60px] font-semibold tracking-[-0.04em] sm:tracking-[-0.045em] leading-[1.02] text-foreground">
            <span className="block">
              Meet{" "}
              <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">
                Chedder
              </span>
              .
            </span>
            <span className="block mt-1 sm:mt-2 text-foreground/45">
              Your assistant for AI search.
            </span>
          </h1>
          <p className="anim-slide-up delay-100 text-[15.5px] sm:text-[19px] leading-[1.5] text-muted-foreground font-normal max-w-[540px] mx-auto tracking-[-0.005em]">
            I check 47 signals across ChatGPT, Perplexity, and Google AI to
            show where your brand stands, and exactly what to fix.
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
                placeholder="Your brand's website..."
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
            Built for DTC and CPG
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

      </div>
      </section>

      {/* ───── PRODUCT PREVIEW ─────
          SimilarWeb-inspired: dark backdrop + layered mosaic of three
          dashboard cards. The main casper.com audit anchors the center;
          smaller competitor-compare and prompt-analysis views tilt
          behind to suggest product depth. Below: trust strip (real
          numbers) and a feature grid of what gets analyzed. */}
      <section className="relative px-6 py-20 sm:py-28 bg-foreground text-white overflow-hidden">
        {/* Coral glow behind the dashboards — same color signature, just
            on a dark surface so it reads as ambient depth not a flat fill. */}
        <div className="absolute inset-x-0 top-1/4 h-1/2 bg-[var(--brand-coral)]/20 blur-[180px] pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-foreground to-transparent pointer-events-none" />

        <div className="relative max-w-[1180px] mx-auto space-y-16 sm:space-y-20">
          <div className="text-center space-y-3 max-w-[680px] mx-auto">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-coral)]">
              What you get
            </div>
            <h2 className="text-[34px] sm:text-[52px] font-semibold tracking-[-0.035em] leading-[1.05] text-white">
              See where you stand in{" "}
              <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">
                AI search
              </span>
              , in 60 seconds.
            </h2>
            <p className="text-[15.5px] sm:text-[17px] text-white/55 leading-[1.55] max-w-[540px] mx-auto pt-3">
              Real shopper prompts. Real AI answers. Your score across the
              seven signals that decide whether AI recommends you.
            </p>
          </div>

          {/* Layered mosaic — three dashboards, center prominent + two
              tilted behind. Uses CSS perspective + rotation for depth. */}
          <div className="relative w-full aspect-[16/10] max-w-[1100px] mx-auto" style={{ perspective: "1800px" }}>
            {/* Left tilted card — competitor comparison */}
            <div
              className="absolute left-0 top-[10%] w-[55%] rounded-xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden border border-white/10 origin-right"
              style={{ transform: "rotateY(14deg) translateZ(-100px) translateX(-4%)", opacity: 0.92 }}
            >
              <ChromeBar url="chedder.2pt.ai / compare" />
              <CompareMock />
            </div>

            {/* Right tilted card — prompt analysis */}
            <div
              className="absolute right-0 top-[10%] w-[55%] rounded-xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden border border-white/10 origin-left"
              style={{ transform: "rotateY(-14deg) translateZ(-100px) translateX(4%)", opacity: 0.92 }}
            >
              <ChromeBar url="chedder.2pt.ai / a / casper / prompts" />
              <PromptsMock />
            </div>

            {/* Center main card — full audit */}
            <div className="absolute left-1/2 top-0 w-[68%] -translate-x-1/2 rounded-xl bg-white shadow-[0_40px_100px_-15px_rgba(0,0,0,0.55)] overflow-hidden border border-white/10 z-10">
              <ChromeBar url="chedder.2pt.ai / a / casper" />
              <AuditMock />
            </div>
          </div>

          {/* Trust strip — light text on dark */}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-5 pt-4">
            {[
              { stat: "197", label: "brands audited" },
              { stat: "15", label: "CPG categories" },
              { stat: "47", label: "signals per audit" },
              { stat: "60s", label: "typical run time" },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center gap-12">
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-semibold text-white tabular-nums tracking-[-0.03em]">{s.stat}</span>
                  <span className="text-[13.5px] text-white/55">{s.label}</span>
                </div>
                {i < arr.length - 1 && <div className="hidden sm:block w-px h-4 bg-white/15" />}
              </div>
            ))}
          </div>

          {/* Feature grid — six cards on the dark backdrop */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {[
              { title: "Page tags", desc: "Title, description, OG, structured data — the wrapper AI reads first." },
              { title: "Content depth", desc: "Visible content quality, AI-citability, comparison readiness." },
              { title: "Trust signals", desc: "Wikipedia, press citations, review density across the open web." },
              { title: "AI access", desc: "GPTBot, ClaudeBot, PerplexityBot, Google-Extended — are they welcome?" },
              { title: "Products", desc: "Product schema, pricing, availability, ratings — AI's product context." },
              { title: "AI citations", desc: "Real prompts across ChatGPT, Perplexity, Brave — who got named, who didn't." },
            ].map((f) => (
              <div key={f.title} className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
                  <h3 className="text-[14.5px] font-semibold text-white tracking-[-0.01em]">{f.title}</h3>
                </div>
                <p className="text-[13px] text-white/60 leading-[1.55]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── HOW CHEDDER WORKS ─────
          Three focused capability cards, each anchored by a Spark
          variant so the character carries the section. Replaces five
          older mid-page sections (Why this matters, What Chedder does,
          How it works, Social proof, Agency CTA) that were doing the
          same selling job with too many words. */}
      <section className="px-6 py-20 sm:py-28 border-t border-foreground/[0.06]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center space-y-3 max-w-[620px] mx-auto mb-14 sm:mb-20">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-coral-dark)]">
              How Chedder works
            </div>
            <h2 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.035em] leading-[1.08]">
              Three things, in 60 seconds.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                variant: "auditing" as const,
                kicker: "01 · See",
                title: "Where you rank in AI",
                body: "Real shopper prompts across ChatGPT, Perplexity, Brave, and Google AI Overviews. Verbatim excerpts of who got named.",
              },
              {
                variant: "thinking" as const,
                kicker: "02 · Know",
                title: "What's holding you back",
                body: "47 signals across schema, content, citations, crawler access, and product data. Scored, prioritized, explained.",
              },
              {
                variant: "celebrating" as const,
                kicker: "03 · Fix",
                title: "With a real action plan",
                body: "Urgent, important, and worth-doing tasks written for brand marketers, not server administrators. Ship in a week.",
              },
            ].map((card) => (
              <div
                key={card.kicker}
                className="group p-6 sm:p-8 rounded-2xl bg-white border border-foreground/[0.06] hover:border-foreground/[0.14] hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.08)] transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-6">
                  <Spark variant={card.variant} animate size={56} />
                  <span className="text-[10.5px] font-semibold tracking-[0.14em] text-foreground/35 uppercase">
                    {card.kicker}
                  </span>
                </div>
                <h3 className="text-[18px] sm:text-[20px] font-semibold text-foreground tracking-[-0.02em] leading-[1.25] mb-2.5">
                  {card.title}
                </h3>
                <p className="text-[13.5px] sm:text-[14px] text-muted-foreground leading-[1.6]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── FINAL CTA ─────
          One sentence, one button. Coral halo behind. The page ends on
          the action we want, not on chrome. */}
      <section className="relative px-6 py-24 sm:py-32 border-t border-foreground/[0.06] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-[var(--brand-coral)]/[0.04] to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[var(--brand-coral)]/15 blur-[120px] rounded-full pointer-events-none" />
        <div className="relative max-w-[640px] mx-auto text-center space-y-7">
          <div className="flex justify-center">
            <Spark variant="peeking" animate size={88} />
          </div>
          <h2 className="text-[34px] sm:text-[48px] font-semibold tracking-[-0.035em] leading-[1.05]">
            Don&apos;t be invisible when shoppers ask AI.
          </h2>
          <p className="text-[16px] sm:text-[17px] text-muted-foreground leading-[1.55] max-w-[460px] mx-auto">
            Run your first audit free. Sixty seconds, no signup.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-foreground text-background text-[15px] font-semibold tracking-[-0.01em] hover:bg-foreground/90 active:scale-[0.98] transition-all"
            >
              Audit my brand
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <SiteFooter />

        {upgrade}
    </main>
  );
}

function scoreAccent(score: number) {
  if (score >= 80) return "#3d8b5e";
  if (score >= 60) return "#6f8aab";
  if (score >= 40) return "#d89c3a";
  return "#c44a3a";
}

/**
 * Mock UIs used in the homepage product-preview mosaic. All inline SVG
 * so they ship with the page, render crisp at every zoom, and don't
 * fight a layered tilt (no async image decoding mid-rotation). Each is
 * a self-contained card body — pair with <ChromeBar /> at the top to
 * frame it as a browser window.
 */

function ChromeBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-1.5 px-4 h-9 border-b border-foreground/[0.06] bg-foreground/[0.015]">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
        <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
        <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
      </div>
      <div className="flex-1 flex justify-center">
        <div className="px-3 py-1 rounded-md bg-foreground/[0.04] text-[10.5px] text-foreground/55 tabular-nums truncate max-w-[60%]">
          {url}
        </div>
      </div>
    </div>
  );
}

/** Main audit dashboard — center of the mosaic. */
function AuditMock() {
  // Helper: sparkline path for a small trend
  const spark = (vals: number[], w = 60, h = 18) => {
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = Math.max(1, max - min);
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <svg viewBox="0 0 1000 660" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      {/* Header — brand left, compact score right */}
      <g transform="translate(36, 36)">
        <rect x="0" y="0" width="52" height="52" rx="11" fill="#0f172a" />
        <text x="26" y="35" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="-apple-system, Inter, sans-serif">C</text>
        <text x="68" y="20" fontSize="20" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">casper.com</text>
        <g transform="translate(68, 32)">
          <rect x="0" y="0" width="78" height="18" rx="4" fill="#f1f5f9" />
          <text x="39" y="13" textAnchor="middle" fontSize="10" fontWeight="600" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">Mattresses</text>
          <text x="86" y="13" fontSize="10.5" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">· 247 pages crawled · 1,830 signals</text>
        </g>
        <text x="68" y="64" fontSize="10" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">audit started 4:12pm · finished in 58s · auto-refresh weekly</text>
      </g>

      {/* Score column — gauge + delta + grade */}
      <g transform="translate(792, 30)">
        <circle cx="34" cy="36" r="30" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        <path d="M 34 6 A 30 30 0 1 1 6 54" fill="none" stroke="#ff5e47" strokeWidth="6" strokeLinecap="round" />
        <text x="34" y="42" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-1" fontFamily="-apple-system, Inter, sans-serif">64</text>
        <g transform="translate(78, 18)">
          <text x="0" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">GRADE B</text>
          <text x="0" y="18" fontSize="11" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">vs Mattresses median: 71</text>
          <g transform="translate(0, 28)">
            <path d={`M 0 14 ${spark([55, 58, 56, 60, 59, 62, 64], 78, 14)}`.replace("M 0 14 M", "M") } fill="none" stroke="#16a34a" strokeWidth="1.5" />
          </g>
          <text x="0" y="68" fontSize="10" fill="#16a34a" fontWeight="600" fontFamily="-apple-system, Inter, sans-serif">+9 over 6 weeks</text>
        </g>
      </g>

      {/* Module cards — 7 specific, slightly varied scores. Two-row grid
          breaks the "five identical boxes" symmetry that read as AI-generated. */}
      <g transform="translate(36, 130)">
        {[
          { label: "Schema markup", score: 87, hint: "Product · Org · FAQ", x: 0, y: 0 },
          { label: "Content depth", score: 73, hint: "12 weak PDPs", x: 144, y: 0 },
          { label: "Crawler access", score: 41, hint: "3 bots blocked", x: 288, y: 0 },
          { label: "Authority", score: 58, hint: "No Wikipedia", x: 432, y: 0 },
          { label: "Product data", score: 23, hint: "No ratings markup", x: 576, y: 0 },
          { label: "External cites", score: 79, hint: "24 sources", x: 720, y: 0 },
          { label: "AI mentions", score: 56, hint: "6 of 18 prompts", x: 0, y: 86 },
        ].map((m) => {
          const color = m.score >= 80 ? "#16a34a" : m.score >= 55 ? "#f59e0b" : "#dc2626";
          return (
            <g key={m.label} transform={`translate(${m.x}, ${m.y})`}>
              <rect x="0" y="0" width="128" height="72" rx="9" fill="#fff" stroke="#e2e8f0" />
              <rect x="0" y="0" width="128" height="2.5" rx="2" fill={color} />
              <text x="12" y="24" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6" fontFamily="-apple-system, Inter, sans-serif">{m.label.toUpperCase()}</text>
              <text x="12" y="50" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-1" fontFamily="-apple-system, Inter, sans-serif">{m.score}</text>
              <text x="44" y="50" fontSize="10" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">/ 100</text>
              <text x="12" y="64" fontSize="9.5" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">{m.hint}</text>
            </g>
          );
        })}
        {/* AI engine breakdown — fills the empty right side of row 2 */}
        <g transform="translate(144, 86)">
          <rect x="0" y="0" width="416" height="72" rx="9" fill="#fafafa" stroke="#e2e8f0" />
          <text x="12" y="20" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6" fontFamily="-apple-system, Inter, sans-serif">CITATION RATE PER ENGINE</text>
          {[
            { engine: "ChatGPT", pct: 28, delta: "-4", color: "#10a37f", x: 12 },
            { engine: "Perplexity", pct: 44, delta: "+11", color: "#1fb6ff", x: 112 },
            { engine: "Brave", pct: 39, delta: "+2", color: "#f97316", x: 212 },
            { engine: "Google AIO", pct: 22, delta: "-7", color: "#4285f4", x: 312 },
          ].map((e) => (
            <g key={e.engine} transform={`translate(${e.x}, 28)`}>
              <circle cx="4" cy="6" r="3" fill={e.color} />
              <text x="12" y="9" fontSize="10" fontWeight="600" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">{e.engine}</text>
              <text x="0" y="28" fontSize="18" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">{e.pct}%</text>
              <text x="36" y="28" fontSize="9.5" fill={e.delta.startsWith("+") ? "#16a34a" : "#dc2626"} fontWeight="600" fontFamily="-apple-system, Inter, sans-serif">{e.delta}</text>
            </g>
          ))}
        </g>
        {/* Streak / activity stat */}
        <g transform="translate(576, 86)">
          <rect x="0" y="0" width="280" height="72" rx="9" fill="#fff1ed" stroke="#ffd9cc" />
          <text x="14" y="20" fontSize="9" fontWeight="700" fill="#b8412f" letterSpacing="0.6" fontFamily="-apple-system, Inter, sans-serif">FASTEST WIN</text>
          <text x="14" y="40" fontSize="14" fontWeight="600" fill="#0f172a" letterSpacing="-0.3" fontFamily="-apple-system, Inter, sans-serif">Unblock GPTBot at Cloudflare</text>
          <text x="14" y="58" fontSize="10.5" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">~3 min · estimated +18 citation rate</text>
        </g>
      </g>

      {/* Findings — denser, real URLs, specific impact estimates */}
      <g transform="translate(36, 320)">
        <rect x="0" y="0" width="928" height="316" rx="12" fill="#fff" stroke="#e2e8f0" />
        <g transform="translate(20, 24)">
          <text x="0" y="0" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">Findings · 17 total</text>
          <text x="0" y="18" fontSize="10.5" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">Sorted by estimated impact on AI citation rate</text>
        </g>
        {/* Filter chips */}
        <g transform="translate(540, 22)">
          {[
            { label: "All", n: 17, active: true },
            { label: "Urgent", n: 3, active: false },
            { label: "Important", n: 8, active: false },
            { label: "Worth doing", n: 6, active: false },
          ].map((c, i) => {
            const x = i === 0 ? 0 : i === 1 ? 38 : i === 2 ? 102 : 184;
            return (
              <g key={c.label} transform={`translate(${x}, 0)`}>
                <rect x="0" y="0" width={c.label === "All" ? 32 : c.label === "Urgent" ? 56 : c.label === "Important" ? 72 : 78} height="20" rx="6" fill={c.active ? "#0f172a" : "transparent"} stroke="#e2e8f0" />
                <text x={(c.label === "All" ? 32 : c.label === "Urgent" ? 56 : c.label === "Important" ? 72 : 78) / 2} y="13" textAnchor="middle" fontSize="9.5" fontWeight={c.active ? "700" : "600"} fill={c.active ? "#fff" : "#475569"} fontFamily="-apple-system, Inter, sans-serif">{c.label} {c.n}</text>
              </g>
            );
          })}
        </g>

        {[
          { sev: "Urgent", color: "#dc2626", title: "12 PDPs missing aggregateRating", meta: "/products/original-mattress and 11 more · est +14% citation rate" },
          { sev: "Urgent", color: "#dc2626", title: "GPTBot blocked at Cloudflare", meta: "Bot Fight Mode: ON · also blocks PerplexityBot · est +18%" },
          { sev: "Urgent", color: "#dc2626", title: "Open Graph image missing on 8 collection pages", meta: "/collections/cooling, /collections/firm and 6 more · est +6%" },
          { sev: "Important", color: "#f59e0b", title: "No Wikipedia entry — likely qualifies", meta: "Has 6 reliable sources (NYT Wirecutter, Fast Company, +4) · est +9%" },
          { sev: "Important", color: "#f59e0b", title: "Reddit footprint thin in /r/Mattress", meta: "3 mentions last 30d vs Purple's 47 · founder-presence: none · est +8%" },
          { sev: "Important", color: "#f59e0b", title: "FAQ schema absent on /how-it-works", meta: "Page already ranks · adding markup unlocks Perplexity citations · est +5%" },
        ].map((f, i) => (
          <g key={i} transform={`translate(20, ${68 + i * 40})`}>
            <rect x="0" y="0" width="58" height="18" rx="9" fill={f.color} fillOpacity="0.12" />
            <text x="29" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill={f.color} fontFamily="-apple-system, Inter, sans-serif">{f.sev}</text>
            <text x="68" y="11" fontSize="12" fontWeight="600" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">{f.title}</text>
            <text x="68" y="26" fontSize="10" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">{f.meta}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Competitor comparison view — left tilted card.
    Richer than a simple bar list: per-brand row shows score, AI mention
    rate, schema/citation breakdown, and a 1-line "edge" summary. The
    asymmetric data (uneven numbers, varied edges) reads as real audit
    output, not a templated comparison. */
function CompareMock() {
  const brands = [
    { name: "Casper", score: 64, cite: 31, schema: 87, cites: 24, edge: "Schema solid · crawler blocked · no Wikipedia", you: true },
    { name: "Purple", score: 71, cite: 44, schema: 72, cites: 31, edge: "Strong Reddit · weak product markup", you: false },
    { name: "Saatva", score: 81, cite: 63, schema: 91, cites: 48, edge: "Wikipedia + listicle dominance", you: false },
    { name: "Tempur-Pedic", score: 78, cite: 58, schema: 85, cites: 52, edge: "Heritage authority · slow on fresh content", you: false },
  ];
  return (
    <svg viewBox="0 0 760 540" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      {/* Header */}
      <g transform="translate(30, 28)">
        <text x="0" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">COMPARE · MATTRESSES</text>
        <text x="0" y="22" fontSize="20" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">Casper vs 3 competitors</text>
        <text x="0" y="40" fontSize="11" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">4 brands · 18 prompts run · refreshed today 4:12pm</text>
      </g>

      {/* Column headers */}
      <g transform="translate(30, 92)" fontFamily="-apple-system, Inter, sans-serif">
        <text x="0" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6">BRAND</text>
        <text x="280" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6">SCORE</text>
        <text x="370" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6">AI MENTION %</text>
        <text x="500" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6">SCHEMA</text>
        <text x="600" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="0.6">CITATIONS</text>
      </g>

      {brands.map((b, i) => (
        <g key={b.name} transform={`translate(0, ${112 + i * 96})`}>
          {/* Row background — coral tint on "you" row to anchor the user */}
          <rect x="20" y="0" width="720" height="84" rx="10" fill={b.you ? "#fff1ed" : "#fafafa"} stroke={b.you ? "#ffd9cc" : "#e2e8f0"} />

          {/* Brand name + "you" pill */}
          <g transform="translate(38, 26)">
            <text x="0" y="0" fontSize="14" fontWeight="700" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">{b.name}</text>
            {b.you && (
              <g transform="translate(0, 12)">
                <rect x="0" y="0" width="26" height="14" rx="7" fill="#ff5e47" />
                <text x="13" y="10" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="-apple-system, Inter, sans-serif">YOU</text>
              </g>
            )}
            <text x="0" y={b.you ? 44 : 22} fontSize="10" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">{b.edge}</text>
          </g>

          {/* Score */}
          <g transform="translate(298, 32)">
            <text x="0" y="0" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-0.8" fontFamily="-apple-system, Inter, sans-serif">{b.score}</text>
            <text x="32" y="0" fontSize="10" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">/100</text>
          </g>

          {/* AI mention rate — number + small bar */}
          <g transform="translate(388, 30)">
            <text x="0" y="0" fontSize="16" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">{b.cite}%</text>
            <rect x="0" y="14" width="80" height="6" rx="3" fill="#f1f5f9" />
            <rect x="0" y="14" width={(b.cite / 70) * 80} height="6" rx="3" fill={b.you ? "#ff5e47" : "#475569"} />
          </g>

          {/* Schema dot + score */}
          <g transform="translate(518, 30)">
            <circle cx="3" cy="-3" r="3" fill={b.schema >= 85 ? "#16a34a" : b.schema >= 70 ? "#f59e0b" : "#dc2626"} />
            <text x="14" y="0" fontSize="14" fontWeight="600" fill="#334155" fontFamily="-apple-system, Inter, sans-serif">{b.schema}</text>
          </g>

          {/* External citations count */}
          <g transform="translate(618, 30)">
            <text x="0" y="0" fontSize="14" fontWeight="600" fill="#334155" fontFamily="-apple-system, Inter, sans-serif">{b.cites}</text>
            <text x="22" y="0" fontSize="9" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">sources</text>
            <text x="0" y="14" fontSize="9" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">{b.cites > 40 ? "Wikipedia + 3 listicles" : b.cites > 30 ? "1 listicle" : "no listicles"}</text>
          </g>
        </g>
      ))}

      {/* Footer chip */}
      <g transform="translate(30, 500)">
        <rect x="0" y="0" width="700" height="28" rx="8" fill="#fafafa" stroke="#e2e8f0" />
        <text x="14" y="18" fontSize="10.5" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">Closing the gap to Saatva mostly needs Wikipedia + 2 more listicle mentions · 6-week effort</text>
      </g>
    </svg>
  );
}

/** Prompt-analysis view — right tilted card.
    Shows real shopper prompts + which brands each engine named. Coral
    chip = your brand appeared. Black chip = competitor named. Grey =
    not named. The mix of hits and misses reads as honest output. */
function PromptsMock() {
  const engines = ["ChatGPT", "Perplexity", "Brave"] as const;
  const engineColors: Record<string, string> = {
    ChatGPT: "#10a37f",
    Perplexity: "#1fb6ff",
    Brave: "#f97316",
  };

  const prompts = [
    {
      q: "best mattress for back pain?",
      ChatGPT: ["Saatva", "Tempur", "Helix"],
      Perplexity: ["Saatva", "Casper", "Tempur"],
      Brave: ["Saatva", "Casper", "Bear"],
    },
    {
      q: "cooling mattress for hot sleepers",
      ChatGPT: ["Purple", "Brooklyn", "Casper"],
      Perplexity: ["Purple", "Cocoon", "Casper"],
      Brave: ["Saatva", "Purple", "Helix"],
    },
    {
      q: "mattress in a box under $1000",
      ChatGPT: ["Nectar", "DreamCloud", "Tuft & Needle"],
      Perplexity: ["Nectar", "Tuft & Needle", "Allswell"],
      Brave: ["Tuft & Needle", "Nectar", "Zinus"],
    },
  ];

  return (
    <svg viewBox="0 0 760 540" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      {/* Header */}
      <g transform="translate(30, 28)">
        <text x="0" y="0" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">PROMPTS TESTED</text>
        <text x="0" y="22" fontSize="20" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">What shoppers actually ask</text>
        <text x="0" y="40" fontSize="11" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">
          Casper appeared in <tspan fontWeight="700" fill="#ff5e47">6 of 18</tspan> prompts · 3 engines · refreshed today
        </text>
      </g>

      {/* Engine legend */}
      <g transform="translate(540, 32)">
        {engines.map((eng, i) => (
          <g key={eng} transform={`translate(${i * 72}, 0)`}>
            <circle cx="4" cy="6" r="3" fill={engineColors[eng]} />
            <text x="12" y="9" fontSize="9.5" fontWeight="600" fill="#475569" fontFamily="-apple-system, Inter, sans-serif">{eng}</text>
          </g>
        ))}
      </g>

      {prompts.map((p, i) => (
        <g key={p.q} transform={`translate(30, ${100 + i * 142})`}>
          <rect x="0" y="0" width="700" height="128" rx="10" fill="#fafafa" stroke="#e2e8f0" />
          <text x="20" y="26" fontSize="13" fontWeight="600" fill="#0f172a" fontStyle="italic" fontFamily="-apple-system, Inter, sans-serif">&ldquo;{p.q}&rdquo;</text>

          {engines.map((eng, j) => (
            <g key={eng} transform={`translate(20, ${44 + j * 26})`}>
              <circle cx="4" cy="9" r="3" fill={engineColors[eng]} />
              <text x="14" y="13" fontSize="9.5" fontWeight="700" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">{eng.toUpperCase()}</text>
              {p[eng].map((b, k) => {
                const isYou = b === "Casper";
                return (
                  <g key={k} transform={`translate(${94 + k * 192}, 0)`}>
                    <rect x="0" y="-2" width="180" height="20" rx="6"
                      fill={isYou ? "#fff1ed" : "#fff"}
                      stroke={isYou ? "#ff5e47" : "#e2e8f0"} />
                    <text x="90" y="12" textAnchor="middle" fontSize="10.5"
                      fontWeight={isYou ? "700" : "500"}
                      fill={isYou ? "#b8412f" : "#0f172a"}
                      fontFamily="-apple-system, Inter, sans-serif">
                      {k + 1}. {b}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

// Rotating fun quips shown under the stage text while the audit runs.
// All DTC-flavored so the wait reinforces "this is built for me" rather
// than reading like generic SEO trivia. Mix of stats, cheese puns, and
// real observations from dogfooding ~200 DTC audits. Keep lines short
// enough to read in about 3 seconds.
const LOADING_QUIPS = [
  "Did you know. About 1 in 4 consumer shoppers now start product research with ChatGPT.",
  "The top three AI picks get most of the clicks. The top pick gets most of those.",
  "Half the brands we audit are blocking GPTBot by accident. We're checking yours now.",
  "AI reads your reviews before your hero image. Make sure they're there.",
  "Your product page schema is doing more work than your TikTok.",
  "Most brands score below 60 on their first audit. Solid room to grow.",
  "Reddit is the secret sauce. AI weighs organic shopper opinions heavily.",
  "Wikipedia is gold. Even a short stub helps you show up.",
  "Brands get cited for being specific, not clever.",
  "If AI sends shoppers to Amazon instead of your site, you keep the order but lose the customer.",
  "Founder story pages are GEO content. AI loves a 'why we built this.'",
  "Structured data is the wrapping paper AI unwraps first.",
  "Over 40 signals checked in every audit. Almost there.",
  "If AI can't read you, it can't recommend you. We're checking that now.",
  "Spark is reading your meta tags right now. Don't make eye contact.",
  "Pages that lead with the answer get cited the most. Bury nothing.",
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
          {/* Spark in auditing mode — bounces gently with a magnifying
              glass while the audit runs. Replaces the old cheese-wheel
              spinner. Coral halo behind ties the character into the
              surface without competing for attention. The Spark
              component handles the bounce + wiggle animations. */}
          <div className="relative w-[100px] h-[104px]">
            <div className="absolute inset-0 rounded-full bg-[var(--brand-coral)]/15 blur-[18px]" />
            <Spark variant="auditing" animate size={100} className="relative" />
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
