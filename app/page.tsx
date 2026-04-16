"use client";

import { useState, useEffect } from "react";
import { AuditResult } from "@/lib/types";
import { AuditDashboard } from "@/components/audit-dashboard";

export default function Home() {
  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const cleanCompetitors = competitors
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          competitors: cleanCompetitors,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setResult(data);
    } catch {
      setError("Failed to connect. Please try again.");
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

  // Full-screen loading with cheese wheel
  if (loading) {
    return <CheeseWheelLoader url={url} />;
  }

  if (result) {
    return (
      <AuditDashboard
        result={result}
        onBack={() => {
          setResult(null);
          setUrl("");
        }}
      />
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-40%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#0071e3]/[0.04] blur-[100px]" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#34c759]/[0.04] blur-[100px]" />
        <div className="absolute top-[20%] right-[-20%] w-[40%] h-[40%] rounded-full bg-[#af52de]/[0.03] blur-[100px]" />
      </div>

      <div className="w-full max-w-[560px] text-center space-y-12">
        {/* Brand */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/[0.04] border border-foreground/[0.06] text-[13px] text-muted-foreground font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
            GEO Audit Tool
          </div>
          <h1 className="text-[48px] sm:text-[64px] font-semibold tracking-[-0.03em] leading-[1] text-foreground">
            Chedder
          </h1>
          <p className="text-[19px] sm:text-[21px] leading-[1.5] text-muted-foreground font-normal max-w-[420px] mx-auto tracking-[-0.01em]">
            See how your brand performs in AI-generated answers across ChatGPT, Perplexity, and Google AI.
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

        {/* What we analyze */}
        {(
          <div className="space-y-5">
            <div className="grid grid-cols-5 gap-4">
              {[
                { icon: "structured_data", label: "Structured\nData" },
                { icon: "meta", label: "Meta\nTags" },
                { icon: "content", label: "Content\nQuality" },
                { icon: "technical", label: "AI\nCrawlers" },
                { icon: "authority", label: "Trust\nSignals" },
              ].map((item) => (
                <div
                  key={item.icon}
                  className="flex flex-col items-center gap-2 group cursor-default"
                >
                  <div className="w-11 h-11 rounded-xl bg-foreground/[0.03] border border-foreground/[0.04] flex items-center justify-center transition-all duration-200 group-hover:bg-foreground/[0.06] group-hover:border-foreground/[0.08] group-hover:scale-105">
                    <FeatureIcon type={item.icon} />
                  </div>
                  <span className="text-[11px] leading-[1.3] text-muted-foreground text-center whitespace-pre-line font-medium">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Made by 2pt */}
        <a
          href="https://twopointtechnologies.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 pt-8 group"
        >
          <img src="/2pt-logo.svg" alt="Two Point Technologies" className="h-6 rounded transition-opacity group-hover:opacity-80" />
          <span className="text-[12px] text-muted-foreground/40 group-hover:text-muted-foreground transition-colors font-medium">
            Made by Two Point Technologies
          </span>
        </a>
      </div>
    </main>
  );
}

function FeatureIcon({ type }: { type: string }) {
  const cls = "w-[18px] h-[18px] text-muted-foreground/60";
  switch (type) {
    case "structured_data":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.27 6.96L12 12.01l8.73-5.05" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22.08V12" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "meta":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>;
    case "content":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>;
    case "technical":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
    case "authority":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    default:
      return null;
  }
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const LOADING_STEPS = [
  "Fetching pages...",
  "Analyzing structured data...",
  "Checking meta tags...",
  "Evaluating content quality...",
  "Testing AI crawlability...",
  "Assessing trust signals...",
  "Compiling results...",
];

function CheeseWheelLoader({ url }: { url: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + 1, LOADING_STEPS.length - 1);
      setStep(i);
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-8">
        {/* Cheese wheel */}
        <div className="relative w-[140px] h-[140px] mx-auto">
          {/* Spinning cheese wheel */}
          <svg viewBox="0 0 100 100" className="w-full h-full animate-spin" style={{ animationDuration: "3s" }}>
            {/* Cheese base */}
            <circle cx="50" cy="50" r="45" fill="#FFB800" />
            {/* Cheese wedge lines */}
            <line x1="50" y1="50" x2="50" y2="5" stroke="#E5A500" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="88.9" y2="27.5" stroke="#E5A500" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="88.9" y2="72.5" stroke="#E5A500" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="50" y2="95" stroke="#E5A500" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="11.1" y2="72.5" stroke="#E5A500" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="11.1" y2="27.5" stroke="#E5A500" strokeWidth="1.5" />
            {/* Cheese holes */}
            <circle cx="35" cy="30" r="5" fill="#E5A500" opacity="0.6" />
            <circle cx="65" cy="35" r="3.5" fill="#E5A500" opacity="0.6" />
            <circle cx="55" cy="65" r="6" fill="#E5A500" opacity="0.6" />
            <circle cx="30" cy="60" r="4" fill="#E5A500" opacity="0.6" />
            <circle cx="70" cy="70" r="3" fill="#E5A500" opacity="0.6" />
            <circle cx="42" cy="48" r="2.5" fill="#E5A500" opacity="0.6" />
            <circle cx="75" cy="50" r="4.5" fill="#E5A500" opacity="0.6" />
            {/* Outer ring */}
            <circle cx="50" cy="50" r="45" fill="none" stroke="#E5A500" strokeWidth="3" />
            {/* Center dot */}
            <circle cx="50" cy="50" r="3" fill="#E5A500" />
          </svg>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Analyzing {url.replace(/^https?:\/\//, "")}
          </h2>
          <p className="text-[15px] text-muted-foreground transition-all duration-300">
            {LOADING_STEPS[step]}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {LOADING_STEPS.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? "#FFB800" : "rgba(29,29,31,0.1)",
                transform: i === step ? "scale(1.5)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
