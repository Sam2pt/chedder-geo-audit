import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

/**
 * File-driven blog content pipeline.
 *
 *   content/posts/<slug>.md
 *
 * Each post is a markdown file with frontmatter:
 *
 *   ---
 *   title: How ChatGPT decides which brands to recommend
 *   date: 2026-06-29
 *   excerpt: A short, search-snippet-friendly description.
 *   readTime: 6 min
 *   draft: false
 *   ---
 *
 *   # Body in markdown...
 *
 * Posts with `draft: true` are excluded from listings and the sitemap.
 * The filename (minus .md) becomes the slug, so a post at
 * content/posts/chatgpt-brand-recommendations.md lives at
 * /blog/chatgpt-brand-recommendations.
 *
 * Server-only — uses node:fs. Do NOT import from a client component.
 */

export interface PostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  draft?: boolean;
}

export interface Post extends PostMeta {
  /** Rendered HTML body. */
  html: string;
  /** Raw markdown body, in case we want to compute reading time, etc. */
  raw: string;
}

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

/**
 * List all published posts, newest first. Drafts are filtered out.
 * Files that fail to parse are skipped with a console warning rather
 * than crashing the whole index (a malformed post should never take
 * the blog down).
 */
export function listPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts: PostMeta[] = [];
  for (const file of files) {
    try {
      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
      const { data } = matter(raw);
      if (data.draft === true) continue;
      posts.push({
        slug,
        title: String(data.title ?? slug),
        excerpt: String(data.excerpt ?? ""),
        date: normalizeDate(data.date),
        readTime: String(data.readTime ?? readingTime(raw)),
      });
    } catch (e) {
      console.warn(`[posts] failed to parse ${file}:`, e);
    }
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Read a single post by slug. Returns null when the file is missing
 * or marked draft, so route handlers can call notFound() cleanly.
 */
export function getPost(slug: string): Post | null {
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const file = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    if (data.draft === true) return null;
    const html = marked.parse(content, { async: false }) as string;
    return {
      slug,
      title: String(data.title ?? slug),
      excerpt: String(data.excerpt ?? ""),
      date: normalizeDate(data.date),
      readTime: String(data.readTime ?? readingTime(content)),
      draft: data.draft === true,
      html,
      raw: content,
    };
  } catch (e) {
    console.warn(`[posts] failed to parse ${slug}:`, e);
    return null;
  }
}

/**
 * Rough reading time at 220 wpm. Used as a fallback when frontmatter
 * doesn't supply `readTime` — saves the author from counting words.
 */
function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min`;
}

/**
 * Normalize a frontmatter date into "YYYY-MM-DD" regardless of how
 * gray-matter parsed it. Unquoted YAML dates become JS Date objects
 * (whose toString includes local timezone), while quoted ones stay
 * as strings — both shapes need to collapse to the same ISO date for
 * stable sorting and timezone-safe display.
 */
function normalizeDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  // Already an ISO-shaped date — keep just the date part.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
