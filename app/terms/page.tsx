import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The rules for using Chedder, the AI search visibility audit tool from Two Point Technologies.",
};

export default function TermsPage() {
  return (
    <main className="flex-1 px-6 py-16">
      <article className="max-w-[720px] mx-auto prose prose-slate">
        <header className="mb-10 space-y-3">
          <Link
            href="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Chedder
          </Link>
          <h1 className="text-[36px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
            Terms of Service
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Last updated 20 April 2026. Effective for anyone using chedder.2pt.ai.
          </p>
        </header>

        <section className="space-y-5 text-[15px] leading-[1.65] text-foreground/90">
          <p>
            Chedder is provided by Two Point Technologies Ltd (&quot;TPT&quot;, &quot;we&quot;). Using Chedder means you agree to what&apos;s below. If you don&apos;t, please don&apos;t use it.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">What Chedder does</h2>

          <p>
            Chedder audits a public website and tells you how visible it is when shoppers ask AI tools (ChatGPT, Perplexity, Brave Search, and similar) for recommendations in that brand&apos;s category. It&apos;s provided as a free beta and is primarily designed for direct-to-consumer and retail consumer brands.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">What you can do with the output</h2>

          <p>
            You can share your own audit results freely. Permalinks are public and can be opened by anyone with the URL. If you&apos;d rather keep a result private, don&apos;t share the link.
          </p>

          <p>
            You&apos;re welcome to quote findings, scores, and recommendations in your own work, with a link back to the audit. We appreciate credit but don&apos;t require it.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">What you agree not to do</h2>

          <ul className="list-disc pl-6 space-y-1.5">
            <li>Submit URLs you don&apos;t have the right to audit, or that aren&apos;t intended to be publicly accessible</li>
            <li>Attempt to circumvent rate limits, or run automated scripts against our endpoints without asking</li>
            <li>Reverse engineer or scrape Chedder itself to build a competing service</li>
            <li>Use Chedder as part of anything illegal, hateful, or designed to harass a specific person or business</li>
          </ul>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">No warranty</h2>

          <p>
            Chedder queries third-party AI tools whose outputs vary and change over time. Scores, competitor lists, and recommendations are based on what those AI tools say at audit time. They&apos;re useful signal, not ground truth. Nothing here is business, legal, or marketing advice.
          </p>

          <p>
            Chedder is provided &quot;as is&quot; without warranties of any kind. We do our best to keep it accurate and available, but we don&apos;t guarantee either.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Liability</h2>

          <p>
            To the maximum extent allowed by law, TPT isn&apos;t liable for any indirect, incidental, or consequential damages arising from your use of Chedder, including lost revenue, lost customers, or lost data. If you do have a claim against TPT related to Chedder, the total aggregate liability is capped at £100 or what you paid us (whichever is greater; and yes, right now Chedder is free, so that&apos;s £100).
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Our data use</h2>

          <p>
            What we collect and how we use it is covered in the <Link href="/privacy" className="text-[#6f8aab] hover:underline">Privacy Policy</Link>. By using Chedder you agree to those terms as well.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Changes</h2>

          <p>
            We may update these terms as the product evolves. Material changes get a banner on the site and (for signed-up users) an email. Continued use after a change means you agree to the new version.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Governing law</h2>

          <p>
            These terms are governed by the laws of England and Wales. Any disputes are subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Contact</h2>

          <p>
            sam@twopointtechnologies.com.
          </p>
          <p className="text-[13px] text-muted-foreground mt-6">
            Two Point Technologies Ltd. UK company registered at [registered address].
          </p>
        </section>

        <div className="mt-12 pt-6 border-t border-black/[0.06] flex gap-4 text-[13px] text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        </div>
      </article>
    </main>
  );
}
