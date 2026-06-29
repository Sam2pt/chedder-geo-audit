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
  return (
    <svg viewBox="0 0 1000 560" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      {/* Brand header — left aligned, no score on the right yet */}
      <g transform="translate(36, 32)">
        <rect x="0" y="0" width="56" height="56" rx="12" fill="#0f172a" />
        <text x="28" y="38" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff" fontFamily="-apple-system, Inter, sans-serif">C</text>
        <text x="76" y="22" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">casper.com</text>
        <text x="76" y="42" fontSize="12" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">Mattresses · audit run 12 mins ago</text>
        <text x="76" y="60" fontSize="10.5" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">4 pages · 47 signals analyzed</text>
      </g>

      {/* Score column on the right — gauge + grade pill, vertically stacked */}
      <g transform="translate(820, 24)">
        <text x="68" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">SCORE</text>
        <circle cx="68" cy="62" r="38" fill="none" stroke="#f1f5f9" strokeWidth="7" />
        <path d="M 68 24 A 38 38 0 1 1 33 84" fill="none" stroke="#ff5e47" strokeWidth="7" strokeLinecap="round" />
        <text x="68" y="68" textAnchor="middle" fontSize="30" fontWeight="700" fill="#0f172a" letterSpacing="-1.5" fontFamily="-apple-system, Inter, sans-serif">66</text>
        <rect x="46" y="108" width="44" height="20" rx="6" fill="#fff1ed" />
        <text x="68" y="122" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#b8412f" fontFamily="-apple-system, Inter, sans-serif">GRADE B</text>
      </g>

      {/* Module cards row */}
      <g transform="translate(36, 156)">
        {[
          { label: "Page tags", score: 90, x: 0 },
          { label: "Content", score: 85, x: 188 },
          { label: "Trust", score: 90, x: 376 },
          { label: "AI access", score: 70, x: 564 },
          { label: "Products", score: 25, x: 752 },
        ].map((m) => {
          const color = m.score >= 80 ? "#16a34a" : m.score >= 60 ? "#f59e0b" : "#dc2626";
          return (
            <g key={m.label} transform={`translate(${m.x}, 0)`}>
              <rect x="0" y="0" width="172" height="74" rx="10" fill="#fafafa" stroke="#e2e8f0" />
              <rect x="0" y="0" width="172" height="3" rx="2" fill={color} />
              <text x="14" y="28" fontSize="9.5" fontWeight="700" fill="#94a3b8" letterSpacing="0.8" fontFamily="-apple-system, Inter, sans-serif">{m.label.toUpperCase()}</text>
              <text x="14" y="56" fontSize="26" fontWeight="700" fill="#0f172a" letterSpacing="-1" fontFamily="-apple-system, Inter, sans-serif">{m.score}</text>
            </g>
          );
        })}
      </g>

      {/* Radar */}
      <g transform="translate(36, 256)">
        <rect x="0" y="0" width="424" height="280" rx="12" fill="#fff" stroke="#e2e8f0" />
        <text x="20" y="28" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">Your signal shape</text>
        <text x="20" y="46" fontSize="11" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">How AI sees your brand across 7 signals</text>
        <g transform="translate(212, 168)">
          {[0.33, 0.66, 1].map((r, i) => (
            <polygon key={i}
              points="0,-83.6 73.0,-41.8 73.0,41.8 0,83.6 -73.0,41.8 -73.0,-41.8"
              transform={`scale(${r})`}
              fill="none" stroke="#e2e8f0" strokeWidth="1" />
          ))}
          <polygon points="0,-75 65,-30 60,40 -10,72 -55,32 -55,-30" fill="#ff5e47" fillOpacity="0.16" stroke="#ff5e47" strokeWidth="2" />
          {[-75, -30, 40, 72, 32, -30].map((y, i) => (
            <circle key={i} cx={[0, 65, 60, -10, -55, -55][i]} cy={y} r="3.5" fill="#ff5e47" />
          ))}
        </g>
      </g>

      {/* Findings */}
      <g transform="translate(484, 256)">
        <rect x="0" y="0" width="480" height="280" rx="12" fill="#fff" stroke="#e2e8f0" />
        <text x="20" y="28" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">Action plan</text>
        <text x="20" y="46" fontSize="11" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">3 urgent · 8 important · 6 worth doing</text>
        {[
          { sev: "Urgent", color: "#dc2626", text: "Product schema missing aggregateRating on 12 PDPs" },
          { sev: "Urgent", color: "#dc2626", text: "GPTBot blocked by Cloudflare bot protection" },
          { sev: "Important", color: "#f59e0b", text: "No Wikipedia entry — qualifies based on coverage" },
          { sev: "Important", color: "#f59e0b", text: "Missing FAQ schema on top-traffic pages" },
          { sev: "Worth doing", color: "#16a34a", text: "Reddit presence in r/mattress is light" },
        ].map((f, i) => (
          <g key={i} transform={`translate(20, ${78 + i * 38})`}>
            <rect x="0" y="0" width="62" height="20" rx="10" fill={f.color} fillOpacity="0.12" />
            <text x="31" y="14" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={f.color} fontFamily="-apple-system, Inter, sans-serif">{f.sev}</text>
            <text x="74" y="14" fontSize="11.5" fill="#334155" fontFamily="-apple-system, Inter, sans-serif">{f.text}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Competitor comparison view — left tilted card. */
function CompareMock() {
  const brands = [
    { name: "Casper", score: 66, color: "#ff5e47", w: 264 },
    { name: "Purple", score: 78, color: "#f59e0b", w: 312 },
    { name: "Saatva", score: 84, color: "#16a34a", w: 336 },
  ];
  return (
    <svg viewBox="0 0 700 480" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(32, 28)">
        <text x="0" y="0" fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">COMPARE</text>
        <text x="0" y="26" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">Casper vs Purple vs Saatva</text>
        <text x="0" y="48" fontSize="12" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">Mattresses · last updated today</text>
      </g>

      {brands.map((b, i) => (
        <g key={b.name} transform={`translate(32, ${110 + i * 100})`}>
          <text x="0" y="0" fontSize="14" fontWeight="700" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">{b.name}</text>
          <text x="624" y="0" textAnchor="end" fontSize="20" fontWeight="700" fill="#0f172a" letterSpacing="-0.8" fontFamily="-apple-system, Inter, sans-serif">{b.score}</text>
          <rect x="0" y="14" width="624" height="10" rx="5" fill="#f1f5f9" />
          <rect x="0" y="14" width={b.w} height="10" rx="5" fill={b.color} />
          <text x="0" y="48" fontSize="11" fill="#94a3b8" fontFamily="-apple-system, Inter, sans-serif">
            {b.name === "Casper" ? "Schema gap · GPTBot blocked" : b.name === "Purple" ? "Strong on Reddit · weak schema" : "Wikipedia entry · listicle leader"}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Prompt-analysis view — right tilted card. */
function PromptsMock() {
  const prompts = [
    { q: "Best mattress for back pain?", brands: [{ n: "Saatva", hit: true }, { n: "Tempur", hit: true }, { n: "Casper", hit: false }] },
    { q: "Best cooling mattress 2026?", brands: [{ n: "Purple", hit: true }, { n: "Casper", hit: true }, { n: "Helix", hit: false }] },
    { q: "Affordable bed in a box?", brands: [{ n: "Tuft & Needle", hit: true }, { n: "Nectar", hit: true }, { n: "Casper", hit: false }] },
  ];
  return (
    <svg viewBox="0 0 700 480" className="w-full h-auto block bg-white" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(32, 28)">
        <text x="0" y="0" fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1" fontFamily="-apple-system, Inter, sans-serif">AI PROMPTS</text>
        <text x="0" y="26" fontSize="22" fontWeight="700" fill="#0f172a" letterSpacing="-0.5" fontFamily="-apple-system, Inter, sans-serif">What shoppers asked AI</text>
        <text x="0" y="48" fontSize="12" fill="#64748b" fontFamily="-apple-system, Inter, sans-serif">Casper appeared in 1 of 3 category prompts</text>
      </g>

      {prompts.map((p, i) => (
        <g key={p.q} transform={`translate(32, ${110 + i * 116})`}>
          <rect x="0" y="0" width="624" height="96" rx="10" fill="#fafafa" stroke="#e2e8f0" />
          <text x="16" y="26" fontSize="12.5" fontWeight="600" fill="#0f172a" fontFamily="-apple-system, Inter, sans-serif">&ldquo;{p.q}&rdquo;</text>
          {p.brands.map((b, j) => (
            <g key={b.n} transform={`translate(${16 + j * 200}, 50)`}>
              <rect x="0" y="0" width="180" height="32" rx="8" fill={b.hit ? (b.n === "Casper" ? "#fff1ed" : "#f1f5f9") : "#fafafa"} stroke={b.hit && b.n === "Casper" ? "#ff5e47" : "#e2e8f0"} />
              <circle cx="14" cy="16" r="4" fill={b.hit && b.n === "Casper" ? "#ff5e47" : b.hit ? "#0f172a" : "#cbd5e1"} />
              <text x="26" y="20" fontSize="11.5" fontWeight={b.n === "Casper" ? "700" : "500"} fill={b.hit && b.n === "Casper" ? "#b8412f" : b.hit ? "#0f172a" : "#94a3b8"} fontFamily="-apple-system, Inter, sans-serif">{b.n}</text>
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
  "Did you know. About 1 in 4 DTC shoppers now start product research with ChatGPT.",
  "The top three AI picks get most of the clicks. The top pick gets most of those.",
  "Half the DTC brands we audit are blocking GPTBot by accident. We're checking yours now.",
  "AI reads your reviews before your hero image. Make sure they're there.",
  "Your product page schema is doing more work than your TikTok.",
  "Most DTC brands score below 60 on their first audit. Solid room to grow.",
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
