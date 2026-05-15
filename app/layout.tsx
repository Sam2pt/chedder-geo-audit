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
    default: "Chedder · The Complete GEO Audit for DTC Brands",
    template: "%s · Chedder",
  },
  description:
    "When shoppers ask ChatGPT or Perplexity what to buy, does your DTC brand come up? Chedder runs the complete GEO audit — score, action plan, and where AI sends customers when it mentions you.",
  keywords: [
    "GEO audit",
    "DTC GEO",
    "AI search visibility",
    "generative engine optimization",
    "DTC SEO",
    "Shopify SEO",
    "ChatGPT optimization",
    "Perplexity optimization",
    "DTC brand audit",
    "AI brand mentions",
  ],
  authors: [{ name: "Two Point Technologies", url: "https://twopointtechnologies.com" }],
  openGraph: {
    type: "website",
    siteName: "Chedder",
    title: "Chedder · The Complete GEO Audit for DTC Brands",
    description:
      "When shoppers ask ChatGPT or Perplexity what to buy, does your DTC brand come up? Free audit, action plan included.",
    url: "https://chedder.2pt.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chedder · The Complete GEO Audit for DTC Brands",
    description:
      "When shoppers ask ChatGPT or Perplexity what to buy, does your DTC brand come up? Free audit, action plan included.",
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
