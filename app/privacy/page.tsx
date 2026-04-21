import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Chedder and Two Point Technologies handle the information you share when you use our AI search visibility audit.",
};

export default function PrivacyPage() {
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
            Privacy
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Last updated 20 April 2026. Effective for anyone using chedder.2pt.ai.
          </p>
        </header>

        <section className="space-y-5 text-[15px] leading-[1.65] text-foreground/90">
          <p>
            Chedder is a free AI search visibility tool built by Two Point Technologies Ltd (&quot;TPT&quot;, &quot;we&quot;, &quot;us&quot;). This page explains what information we collect when you use it, why we collect it, and what we do with it. We wrote it in plain English. If anything here is unclear, email sam@twopointtechnologies.com and we&apos;ll fix it.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">What we collect</h2>

          <p>
            When you run an audit, we record:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>The URL you entered and the public information we fetched from it (page content, meta tags, structured data)</li>
            <li>The technical results of the audit (scores, findings, recommendations)</li>
            <li>A random anonymous identifier saved in your browser&apos;s local storage, so we can show you your own recent audits without requiring a login</li>
            <li>Standard web request metadata: your IP address, browser user agent, and referring page, which our hosting provider (Netlify) logs for security and abuse prevention</li>
          </ul>

          <p>
            When you run a second audit, we ask for your name, role, company, and work email. That information is kept on our servers and used to follow up with you if we think TPT can help with what the audit surfaced. You&apos;re never going to get marketing mail from us that isn&apos;t relevant to your brand. You can ask us to delete it at any time.
          </p>

          <p>
            We also record lightweight behavioral events (page visits, audits started, audits completed, shares, signups). We use this to understand how the tool gets used so we can make it better. These events are tied to the anonymous identifier above and, if you&apos;ve signed up, your email.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">What we don&apos;t collect</h2>

          <ul className="list-disc pl-6 space-y-1.5">
            <li>Passwords. There&apos;s no login yet and we don&apos;t want any.</li>
            <li>Payment information. Chedder is free.</li>
            <li>Anything about your customers. We audit your public website, not your data.</li>
            <li>We don&apos;t run third-party advertising trackers, session replays, or analytics pixels (Meta, Google, TikTok, etc.).</li>
          </ul>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Where your data lives</h2>

          <p>
            Chedder&apos;s data lives in Netlify Blobs (our hosting provider&apos;s managed storage) in EU and US regions. Audit results are keyed by a short slug so the shareable permalink URL works. Your submitted contact details are keyed by email.
          </p>

          <p>
            We call a handful of AI providers to run the audit: OpenAI (ChatGPT with web search), Perplexity, and Brave Search. The URL and category of the brand being audited are included in those requests so the AI can answer correctly. We don&apos;t send your name or email to them.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Your rights</h2>

          <p>
            Under UK GDPR and comparable laws, you can ask us to:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Show you a copy of everything we hold about you</li>
            <li>Correct anything that&apos;s wrong</li>
            <li>Delete your record entirely</li>
            <li>Stop processing your data for marketing purposes</li>
          </ul>

          <p>
            Email sam@twopointtechnologies.com with the email address you signed up with and we&apos;ll action it within 30 days.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Sharing</h2>

          <p>
            We don&apos;t sell your information. We share what&apos;s strictly necessary with:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Our hosting provider (Netlify) to run the service</li>
            <li>The AI providers above, to answer the audit queries</li>
            <li>The TPT team, who uses Chedder internally for client work</li>
            <li>Authorities if we&apos;re legally required</li>
          </ul>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Cookies</h2>

          <p>
            We don&apos;t use cookies for tracking. The only thing we store on your device is a random anonymous identifier in local storage so your audit history shows up next time you visit, and a flag indicating whether you&apos;ve completed the signup form. Clearing your browser data removes both.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Changes to this policy</h2>

          <p>
            If we change anything material we&apos;ll update the date at the top and, for people who have signed up, send an email.
          </p>

          <h2 className="text-[22px] font-semibold tracking-[-0.015em] mt-8">Contact</h2>

          <p>
            Questions: sam@twopointtechnologies.com.
          </p>
          <p className="text-[13px] text-muted-foreground mt-6">
            Two Point Technologies Ltd. UK company registered at [registered address].
          </p>
        </section>

        <div className="mt-12 pt-6 border-t border-black/[0.06] flex gap-4 text-[13px] text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        </div>
      </article>
    </main>
  );
}
