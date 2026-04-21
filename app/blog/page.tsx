import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on AI search visibility, generative engine optimization, and what's changing for consumer brands.",
};

interface PostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
}

const posts: PostMeta[] = [
  {
    slug: "introducing-chedder",
    title: "Introducing Chedder: see your brand the way AI sees it",
    excerpt:
      "Search is becoming conversation. Your shoppers are asking ChatGPT and Perplexity which brand to buy, and the answer doesn't always include you. Here's the tool we built to change that.",
    date: "2026-04-20",
    readTime: "4 min",
  },
];

export default function BlogIndex() {
  return (
    <main className="flex-1 px-6 py-16">
      <article className="max-w-[720px] mx-auto">
        <header className="mb-12 space-y-3">
          <Link
            href="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Chedder
          </Link>
          <h1 className="text-[36px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
            Blog
          </h1>
          <p className="text-[14px] text-muted-foreground leading-[1.6]">
            Field notes from building Chedder. Written for consumer brand teams
            who want to show up when shoppers ask AI.
          </p>
        </header>

        <ul className="space-y-8">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="block group rounded-2xl border border-black/[0.06] bg-white p-6 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]"
              >
                <div className="text-[12px] text-muted-foreground mb-2 flex items-center gap-2">
                  <time dateTime={p.date}>
                    {new Date(p.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                  <span>·</span>
                  <span>{p.readTime} read</span>
                </div>
                <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-foreground leading-snug group-hover:text-[#0071e3] transition-colors">
                  {p.title}
                </h2>
                <p className="text-[14.5px] text-muted-foreground leading-[1.6] mt-2">
                  {p.excerpt}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
