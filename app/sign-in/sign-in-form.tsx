"use client";

import { useState } from "react";
import { getDeviceId } from "@/lib/track";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !email.trim()) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), deviceId: getDeviceId() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        devLink?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      setSent(true);
      if (data.devLink) setDevLink(data.devLink);
    } catch {
      setError("Could not reach our servers. Try again.");
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-white border border-black/[0.08] px-5 py-6 space-y-3 text-center">
        <div className="text-[16px] font-semibold text-foreground">
          Check your inbox
        </div>
        <p className="text-[13.5px] text-muted-foreground leading-[1.55]">
          We&apos;ve sent a sign-in link to <strong>{email}</strong>. It
          expires in 15 minutes and only works once.
        </p>
        {devLink && (
          <div className="pt-2 border-t border-black/[0.06] mt-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/60 mb-1">
              Dev mode (no email provider set)
            </p>
            <a
              href={devLink}
              className="text-[12px] font-mono text-[#0071e3] break-all hover:underline"
            >
              {devLink}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-[12px] font-medium text-foreground/70 mb-1 block">
          Work email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@bigbarker.com"
          required
          autoFocus
          autoComplete="email"
          className="w-full h-11 px-3 rounded-lg bg-white border border-foreground/[0.12] text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]/40 transition-colors"
        />
      </label>
      {error && (
        <div className="text-[12.5px] text-[#d70015] bg-[#ff453a]/[0.06] border border-[#ff453a]/[0.15] rounded-lg px-3 py-2 leading-snug">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !email.trim()}
        className="w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[14px] tracking-[-0.01em] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
      >
        {submitting ? "Sending your link…" : "Send me a sign-in link"}
      </button>
    </form>
  );
}
