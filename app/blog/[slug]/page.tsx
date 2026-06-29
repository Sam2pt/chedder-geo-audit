import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/lib/posts";

/**
 * Dynamic blog post page. Reads markdown from content/posts/<slug>.md
 * and renders the HTML body inside the same styled article wrapper
 * the old hand-rolled posts used. To publish a new post, drop a .md
 * file into content/posts/ — no code changes needed.
 *
 * generateStaticParams pre-renders every published post at build
 * time, so blog pages serve as static HTML with no per-request cost.
 */

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: ["Two Point Technologies"],
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const formattedDate = post.date
    ? new Date(post.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

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
            {formattedDate && (
              <>
                <time dateTime={post.date}>{formattedDate}</time>
                <span>·</span>
              </>
            )}
            <span>{post.readTime} read</span>
          </div>
          <h1 className="text-[40px] font-semibold tracking-[-0.02em] text-foreground leading-[1.1]">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-[18px] text-muted-foreground leading-[1.55]">
              {post.excerpt}
            </p>
          )}
        </header>

        <div
          className="post-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        <footer className="mt-16 pt-8 border-t border-black/[0.06] space-y-4">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)]/10 via-[var(--brand-accent-2)]/5 to-[var(--brand-coral)]/5 border border-black/[0.06]">
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
              className="text-[var(--brand-coral)] hover:underline"
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
