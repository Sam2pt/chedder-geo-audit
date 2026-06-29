import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";
import { Spark } from "@/components/spark";

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
    <div className="min-h-screen flex flex-col">
    <TopNav variant="solid" />
    <main className="flex-1 px-6 py-16 flex items-start justify-center">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            {/* Spark greets the user — friendlier than a logo block here,
                and reinforces the character as the "assistant" who's
                about to help once they're inside. */}
            <Spark variant="idle" animate size={68} />
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
          <div className="rounded-xl bg-[#c44a3a]/[0.08] border border-[#c44a3a]/[0.2] px-4 py-3 text-[13px] text-[#9e342a] leading-snug">
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
    <SiteFooter />
    </div>
  );
}
