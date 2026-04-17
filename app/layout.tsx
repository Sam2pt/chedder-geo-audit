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
  title: "Chedder · AI Search Visibility",
  description:
    "See how your brand shows up when customers ask ChatGPT, Perplexity, and Brave Search for recommendations.",
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
