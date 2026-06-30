"use client";

/**
 * ChedderLoop — 8-second hero animation. Chedder runs an audit, the
 * dashboard fades up, the score counts to 64, Chedder celebrates, the
 * CTA pill lands. Loops cleanly.
 *
 *   <ChedderLoop />            // default size
 *   <ChedderLoop size={520} /> // explicit size — square aspect
 *
 * Built from primitives that already exist (Spark component, coral
 * tokens, score numerals). No Lottie/Rive dep — just CSS keyframes
 * scoped to this component, which means it animates the moment React
 * mounts it.
 *
 * Why build it here instead of in After Effects + Lottie:
 *   1. Reuses the actual Spark component, so the character stays
 *      pixel-identical to what users see in the app.
 *   2. Editing the timing is editing CSS, not opening a binary file.
 *   3. Screen-recordable for LinkedIn video posts (60fps, transparent
 *      background possible via a recorder like Loom or QuickTime over
 *      a coral backdrop).
 *
 * The 8-second timeline lives in a single `chedderLoop` keyframe set
 * defined in app/globals.css; this component just renders the cast
 * and lets the keyframes drive each element's transform/opacity at
 * the right beat.
 */

import { Spark } from "./spark";

interface ChedderLoopProps {
  /** Pixel width. Component is square — height = width. */
  size?: number;
  /** Optional className for layout. */
  className?: string;
}

export function ChedderLoop({ size = 480, className }: ChedderLoopProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-foreground ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Coral glow backdrop — same brand signature, ambient depth */}
      <div className="absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[80%] bg-[var(--brand-coral)]/25 blur-[80px] rounded-full" />
      </div>

      {/* Subtle grid texture for depth */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Chedder character — peeks in (0-1.6s), scans (1.6-5s), celebrates (5-8s) */}
      <div
        className="absolute"
        style={{
          left: "10%",
          top: "30%",
          width: size * 0.32,
          height: size * 0.33,
          animation: "chedderEnter 8s ease-in-out infinite",
        }}
      >
        <div style={{ animation: "chedderSwap 8s steps(1, end) infinite" }}>
          {/* Idle/peeking variant — visible 0-1.6s and 5-8s */}
          <div className="absolute inset-0" style={{ animation: "chedderShowIdle 8s steps(1, end) infinite" }}>
            <Spark variant="idle" animate size={size * 0.32} />
          </div>
          {/* Auditing variant — visible 1.6-5s */}
          <div className="absolute inset-0 opacity-0" style={{ animation: "chedderShowAudit 8s steps(1, end) infinite" }}>
            <Spark variant="auditing" animate size={size * 0.32} />
          </div>
          {/* Celebrating variant — visible 5-8s */}
          <div className="absolute inset-0 opacity-0" style={{ animation: "chedderShowCelebrate 8s steps(1, end) infinite" }}>
            <Spark variant="celebrating" animate size={size * 0.32} />
          </div>
        </div>
      </div>

      {/* Dashboard mock — fades up between 3.2-5s, stays visible to ~6.5s */}
      <div
        className="absolute"
        style={{
          right: "8%",
          top: "22%",
          width: size * 0.46,
          animation: "chedderDashboard 8s ease-out infinite",
        }}
      >
        <div className="rounded-xl bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-1 px-3 h-6 border-b border-foreground/[0.06] bg-foreground/[0.02]">
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/15" />
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/15" />
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/15" />
          </div>
          {/* Brand row */}
          <div className="p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-foreground flex items-center justify-center text-white text-[12px] font-bold">C</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground leading-none">casper.com</p>
              <p className="text-[8.5px] text-muted-foreground mt-0.5">Mattresses · 247 pages</p>
            </div>
            {/* Score numeral — counts via keyframes */}
            <div className="text-right">
              <div className="text-[20px] font-bold text-foreground tabular-nums leading-none" style={{ animation: "chedderScoreCount 8s steps(1, end) infinite" }}>
                <span style={{ animation: "chedderScore0 8s steps(1, end) infinite" }}>0</span>
                <span className="hidden" style={{ animation: "chedderScore22 8s steps(1, end) infinite" }}>22</span>
                <span className="hidden" style={{ animation: "chedderScore47 8s steps(1, end) infinite" }}>47</span>
                <span className="hidden" style={{ animation: "chedderScore64 8s steps(1, end) infinite" }}>64</span>
              </div>
            </div>
          </div>
          {/* Module cards row — fade in staggered */}
          <div className="px-3 pb-3 grid grid-cols-4 gap-1.5">
            {[
              { label: "Schema", val: 87, color: "#16a34a", delay: "3.4s" },
              { label: "Content", val: 73, color: "#f59e0b", delay: "3.6s" },
              { label: "Crawler", val: 41, color: "#dc2626", delay: "3.8s" },
              { label: "AI cite", val: 56, color: "#f59e0b", delay: "4.0s" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-md bg-foreground/[0.03] p-1.5 opacity-0"
                style={{ animation: `chedderModuleFade 8s ${m.delay} ease-out infinite` }}
              >
                <div className="h-0.5 w-full rounded-sm mb-1" style={{ background: m.color }} />
                <p className="text-[7px] font-bold uppercase text-muted-foreground tracking-wider">{m.label}</p>
                <p className="text-[12px] font-bold text-foreground leading-none mt-0.5">{m.val}</p>
              </div>
            ))}
          </div>
          {/* Findings line — fades last */}
          <div
            className="px-3 pb-3 opacity-0"
            style={{ animation: "chedderFindingsFade 8s 4.2s ease-out infinite" }}
          >
            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider mb-1">Findings · 17 total</p>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-1 py-px rounded-sm bg-[#dc2626]/15 text-[#dc2626] text-[7.5px] font-bold">URGENT</span>
              <span className="text-[8px] text-foreground/80 truncate">GPTBot blocked at Cloudflare</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA pill — lands at 6.5s, holds to end */}
      <div
        className="absolute bottom-[10%] left-1/2 -translate-x-1/2 opacity-0"
        style={{ animation: "chedderCtaLand 8s 6.5s cubic-bezier(0.34, 1.56, 0.64, 1) infinite" }}
      >
        <div className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[var(--brand-coral)] text-white text-[14px] font-semibold tracking-[-0.01em] shadow-[0_10px_30px_-8px_rgba(255,94,71,0.5)]">
          Audit my brand
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Brand mark — sits in the corner across the whole loop */}
      <div className="absolute top-5 left-5 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
        <span className="text-white text-[13px] font-bold tracking-[-0.025em]">Chedder</span>
      </div>
    </div>
  );
}
