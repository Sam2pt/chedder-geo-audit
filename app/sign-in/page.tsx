import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ error?: string; sent?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  // Already signed in? Go straight to My Audits.
  const current = await getCurrentUser();
  if (current) redirect("/my-audits");

  const { error, sent } = await searchParams;

  return (
    <main className="flex-1 px-6 py-16 flex items-start justify-center">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="text-center space-y-3">
          <Link
            href="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Chedder
          </Link>
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d8a23e] to-[#b58632] flex items-center justify-center shadow-[inset_0_-2px_4px_rgba(0,0,0,0.12)]">
              <svg viewBox="0 0 100 100" className="w-8 h-8">
                <circle cx="50" cy="50" r="46" fill="#fff" fillOpacity="0.15" />
                <circle cx="34" cy="37" r="6" fill="#9a6d24" />
                <circle cx="64" cy="33" r="4" fill="#9a6d24" />
                <circle cx="58" cy="62" r="8" fill="#9a6d24" />
                <circle cx="32" cy="67" r="4" fill="#9a6d24" />
              </svg>
            </div>
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-foreground">
            Sign in to Chedder
          </h1>
          <p className="text-[14px] text-muted-foreground leading-[1.55]">
            Enter your email and we&apos;ll send a one-time sign-in link.
            No password, no signup form.
          </p>
        </div>

        {error === "expired" && (
          <div className="rounded-xl bg-[#b5443b]/[0.08] border border-[#b5443b]/[0.2] px-4 py-3 text-[13px] text-[#8c3128] leading-snug">
            That sign-in link already expired or was used. Pop your email in below and we&apos;ll send a fresh one.
          </div>
        )}

        {sent === "1" ? (
          <div className="rounded-xl bg-white border border-black/[0.08] px-5 py-6 space-y-2 text-center">
            <div className="text-[16px] font-semibold text-foreground">
              Check your inbox
            </div>
            <p className="text-[13.5px] text-muted-foreground leading-[1.55]">
              We&apos;ve sent a sign-in link. It expires in 15 minutes and only
              works once.
            </p>
          </div>
        ) : (
          <SignInForm />
        )}

        <p className="text-[12px] text-muted-foreground/70 text-center leading-snug">
          By signing in you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground">terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">privacy policy</Link>.
        </p>
      </div>
    </main>
  );
}
