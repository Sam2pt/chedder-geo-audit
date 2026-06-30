import type { Metadata } from "next";
import { ChedderLoop } from "@/components/chedder-loop";

/**
 * /loop — internal preview page for the ChedderLoop animation.
 *
 * Not linked from anywhere; used to screen-record the loop for
 * LinkedIn / social. Hide it from search engines so it doesn't
 * surface in the brand directory.
 */
export const metadata: Metadata = {
  title: "Loop · Chedder",
  robots: { index: false, follow: false },
};

export default function LoopPreviewPage() {
  return (
    <main className="min-h-screen bg-foreground text-white flex flex-col items-center justify-center px-6 py-16 gap-12">
      <div className="text-center space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-coral)]">
          Internal preview · screen-record this
        </p>
        <h1 className="text-[28px] font-semibold tracking-[-0.025em]">
          ChedderLoop — 8s
        </h1>
        <p className="text-[13px] text-white/55 max-w-[440px] mx-auto leading-[1.55]">
          QuickTime Player → File → New Screen Recording → drag the box to
          fit just the animation. Stop after 16 seconds (two clean loops),
          trim to 8 seconds in iMovie. Export 1080×1080.
        </p>
      </div>

      <ChedderLoop size={520} />

      <ChedderLoop size={320} />
    </main>
  );
}
