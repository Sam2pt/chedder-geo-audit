import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for all metadata URLs (og:image, canonical, etc.) —
  // otherwise Next.js resolves them against http://localhost:3000 in
  // dev-style output even in production builds.
  metadataBase: new URL("https://chedder.2pt.ai"),
  title: {
    default: "Chedder · AI Search Visibility",
    template: "%s · Chedder",
  },
  description:
    "See how your brand shows up when customers ask ChatGPT, Perplexity, and Brave Search for recommendations. Free audit in under a minute.",
  keywords: [
    "AI search visibility",
    "generative engine optimization",
    "GEO",
    "ChatGPT SEO",
    "Perplexity",
    "brand audit",
    "CPG marketing",
  ],
  authors: [{ name: "Two Point Technologies", url: "https://twopointtechnologies.com" }],
  openGraph: {
    type: "website",
    siteName: "Chedder",
    title: "Chedder · AI Search Visibility",
    description:
      "See how your brand shows up when customers ask ChatGPT, Perplexity, and Brave Search for recommendations.",
    url: "https://chedder.2pt.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chedder · AI Search Visibility",
    description:
      "See how your brand shows up when customers ask ChatGPT, Perplexity, and Brave Search for recommendations.",
  },
  // Favicon comes from app/icon.tsx (auto-detected by Next.js).
  // OG image comes from app/opengraph-image.tsx (auto-detected).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
