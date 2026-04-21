import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Introducing Chedder: see your brand the way AI sees it",
  description:
    "Search is becoming conversation. Chedder audits how your CPG brand shows up when shoppers ask ChatGPT, Perplexity, and Brave Search for recommendations.",
  openGraph: {
    title: "Introducing Chedder",
    description:
      "See how your brand shows up when shoppers ask AI for recommendations.",
    type: "article",
    publishedTime: "2026-04-20",
    authors: ["Two Point Technologies"],
  },
};

export default function IntroducingChedderPost() {
  return (
    <main className="flex-1 px-6 py-16">
      <article className="max-w-[720px] mx-auto">
        <header className="mb-10 space-y-4">
          <Link
            href="/blog"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All posts
          </Link>
          <div className="text-[12px] text-muted-foreground flex items-center gap-2">
            <time dateTime="2026-04-20">20 April 2026</time>
            <span>·</span>
            <span>4 min read</span>
          </div>
          <h1 className="text-[40px] font-semibold tracking-[-0.02em] text-foreground leading-[1.1]">
            Introducing Chedder: see your brand the way AI sees it
          </h1>
          <p className="text-[18px] text-muted-foreground leading-[1.55]">
            Search is becoming conversation. Here&apos;s the tool we built to
            help consumer brands show up in the answer.
          </p>
        </header>

        <Body />

        <footer className="mt-16 pt-8 border-t border-black/[0.06] space-y-4">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#FFB800]/10 via-[#0071e3]/5 to-[#8b5cf6]/10 border border-black/[0.06]">
            <p className="text-[15px] font-semibold text-foreground mb-2">
              Run a free audit
            </p>
            <p className="text-[14px] text-muted-foreground leading-[1.6] mb-4">
              Paste your URL. Chedder tests real customer questions across AI
              chats and AI search, then tells you exactly what to fix. Takes
              under a minute.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-[14px] font-semibold tracking-[-0.01em] hover:bg-foreground/90 transition-colors"
            >
              Try Chedder
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Chedder is built by{" "}
            <a
              href="https://twopointtechnologies.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0071e3] hover:underline"
            >
              Two Point Technologies
            </a>
            , a small team helping consumer brands win the next era of search.
          </p>
        </footer>
      </article>
    </main>
  );
}

function Body() {
  return (
    <div className="prose prose-slate max-w-none space-y-5 text-[16px] leading-[1.7] text-foreground/90">
      <p>
        A shopper wakes up on a Saturday, thinks about replacing their old dog
        bed, and asks ChatGPT: &quot;best orthopedic dog bed for a senior lab.&quot;
        They get a short list. Maybe three brands, with reasons. They click on
        one. They buy.
      </p>
      <p>
        The whole journey takes 90 seconds. There&apos;s no Google results
        page. No paid ad. No SEO-optimized listicle to skim. Just a
        conversation, and a recommendation.
      </p>
      <p>
        If your brand wasn&apos;t one of the three, you didn&apos;t lose the
        sale. You never had a shot at it.
      </p>

      <h2 className="text-[24px] font-semibold tracking-[-0.015em] mt-10 text-foreground">
        The shift nobody told your marketing team about
      </h2>
      <p>
        Roughly one in four consumer shoppers now starts product research with
        an AI tool instead of a search engine. For higher-consideration
        categories, think mattresses, skincare, pet nutrition, premium
        chocolate, the number is climbing faster than anyone planned for.
      </p>
      <p>
        The behavior is new. The question your brand faces is ancient: when a
        customer asks, does somebody recommend you?
      </p>
      <p>
        The catch is that the somebody doing the recommending is no longer a
        friend, a forum, or a favorite reviewer. It&apos;s a large language
        model with its own opinion, built from a stew of structured data,
        Wikipedia entries, Reddit threads, review sites, and the contents of
        your own website. Some of those signals you&apos;ve been thinking
        about for years. Some of them are brand new.
      </p>

      <h2 className="text-[24px] font-semibold tracking-[-0.015em] mt-10 text-foreground">
        So we built Chedder
      </h2>
      <p>
        Chedder is a free audit for consumer brands. You paste a URL, wait
        under a minute, and get back:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Real AI answers.</strong> We run your brand through actual
          customer prompts on AI chats and AI search, then report who got
          recommended and who didn&apos;t. With verbatim excerpts.
        </li>
        <li>
          <strong>The labels AI reads first.</strong> Schema, JSON-LD,
          structured data. The wrapper AI unwraps before it even reads your
          page.
        </li>
        <li>
          <strong>What the web whispers about you.</strong> Wikipedia, Reddit,
          external citations. The corroborating voices AI quietly leans on.
        </li>
        <li>
          <strong>Whether the crawlers are welcome.</strong> GPTBot,
          ClaudeBot, Google-Extended. If they&apos;re blocked, you&apos;re
          invisible before the conversation starts.
        </li>
        <li>
          <strong>A scored action plan.</strong> Seven modules, one overall
          grade, prioritized fixes written for humans, not spec sheets.
        </li>
      </ul>

      <h2 className="text-[24px] font-semibold tracking-[-0.015em] mt-10 text-foreground">
        Who it&apos;s for
      </h2>
      <p>
        Consumer brands. Direct-to-consumer and traditional retail. Pet food,
        mattresses, candy, detergent, candles, beauty, beverages. If shoppers
        ask AI which one to buy, this tool is for you.
      </p>
      <p>
        We skipped the B2B SaaS framing on purpose. The shopper asking
        ChatGPT about a dog bed isn&apos;t writing a procurement RFP. The
        answer they get matters in a way that spreadsheets can&apos;t measure.
      </p>

      <h2 className="text-[24px] font-semibold tracking-[-0.015em] mt-10 text-foreground">
        What we saw when we dogfooded it
      </h2>
      <p>
        We ran dozens of big-name CPG brands through early versions. A few
        patterns jumped out:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          Most brands score below 60 on their first audit. Even the ones with
          nine-figure ad budgets.
        </li>
        <li>
          Schema is the easiest win. Nearly every brand has room to add FAQ,
          Product, or Organization markup that AI models love.
        </li>
        <li>
          Reddit matters more than most marketing teams admit. Authentic
          mentions in category threads are rocket fuel for AI recommendations.
        </li>
        <li>
          The single fastest way to disappear from AI answers is to block
          GPTBot in robots.txt. It&apos;s also surprisingly common, often by
          accident.
        </li>
      </ul>

      <h2 className="text-[24px] font-semibold tracking-[-0.015em] mt-10 text-foreground">
        What happens next
      </h2>
      <p>
        Chedder is free while we learn what brands need most. The audit runs
        anonymously the first time. If you want to come back to your results,
        tell us who you are and we&apos;ll save them.
      </p>
      <p>
        If you like what you see and want help implementing, the team behind
        Chedder (
        <a
          href="https://twopointtechnologies.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0071e3] hover:underline"
        >
          Two Point Technologies
        </a>
        ) turns audits into 90-day plans for brands that want to lead in AI
        search.
      </p>
      <p>
        Otherwise, take the audit, take the action plan, and go make your
        brand easier for AI to recommend. The Saturday-morning shopper
        isn&apos;t waiting.
      </p>
    </div>
  );
}
