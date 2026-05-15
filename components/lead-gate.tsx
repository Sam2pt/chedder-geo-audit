"use client";

import { useState } from "react";
import { track, getDeviceId } from "@/lib/track";

/**
 * Soft gate form shown after a user's first free audit. Captures
 * name + role + company + email in exchange for unlimited further
 * audits. Positioned as "save your audit and run more," not as a
 * paywall — stays on the inviting side of the tone.
 *
 * The parent owns the "should I show the gate" decision (via
 * localStorage) and wires `onComplete` to continue the audit flow.
 */

export function LeadGate({
  onComplete,
  onDismiss,
  sourceAuditSlug,
}: {
  onComplete: () => void;
  onDismiss?: () => void;
  sourceAuditSlug?: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          company,
          email,
          sourceAuditSlug,
          deviceId: getDeviceId(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string })?.error || "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      // Mark the browser as "signed up" so we don't gate again.
      try {
        localStorage.setItem("chedder:signedUp", "1");
        localStorage.setItem(
          "chedder:leadEmail",
          email.trim().toLowerCase()
        );
      } catch {
        // ignore storage errors
      }
      track(
        "gate.submitted",
        { role: role.slice(0, 60), company: company.slice(0, 60) },
        { slug: sourceAuditSlug }
      );
      onComplete();
    } catch {
      setError("Could not reach our servers. Try again in a moment.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]">
      <div className="relative w-full max-w-[440px] rounded-[22px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-7 sm:p-8 space-y-5">
        {/* Cheese wheel accent */}
        <div className="flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--brand-gold)] flex items-center justify-center shadow-[inset_0_-2px_4px_rgba(31,30,29,0.12)]">
            <svg viewBox="0 0 100 100" className="w-8 h-8">
              <circle cx="34" cy="37" r="6" fill="#1f1e1d" opacity="0.85" />
              <circle cx="64" cy="33" r="4" fill="#1f1e1d" opacity="0.85" />
              <circle cx="58" cy="62" r="8" fill="#1f1e1d" opacity="0.85" />
              <circle cx="32" cy="67" r="4" fill="#1f1e1d" opacity="0.85" />
            </svg>
          </div>
        </div>

        <div className="text-center space-y-1.5">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Want another slice?
          </h2>
          <p className="text-[14px] text-muted-foreground leading-snug">
            Tell us a bit about your brand and we&apos;ll unlock unlimited audits, plus save your results so you can come back to them.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            label="Your name"
            value={name}
            onChange={setName}
            placeholder="Alex Smith"
            autoComplete="name"
            required
          />
          <Field
            label="Your role"
            value={role}
            onChange={setRole}
            placeholder="Head of Marketing"
            autoComplete="organization-title"
            required
          />
          <Field
            label="Company"
            value={company}
            onChange={setCompany}
            placeholder="Big Barker"
            autoComplete="organization"
            required
          />
          <Field
            label="Work email"
            value={email}
            onChange={setEmail}
            placeholder="alex@bigbarker.com"
            type="email"
            autoComplete="email"
            required
          />

          {error && (
            <div className="text-[12.5px] text-[#8c3128] bg-[#b5443b]/[0.06] border border-[#b5443b]/[0.15] rounded-lg px-3 py-2 leading-snug">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !role || !company || !email}
            className="w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[14px] tracking-[-0.01em] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
          >
            {submitting ? "Saving your details…" : "Save and run another audit"}
          </button>
        </form>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="block w-full text-[12px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            Maybe later
          </button>
        )}

        <p className="text-[11px] text-muted-foreground/60 text-center leading-snug">
          No spam. We use your details to follow up only if it makes sense for your brand. See our{" "}
          <a href="/privacy" target="_blank" className="underline hover:text-muted-foreground">privacy policy</a>
          {" "}and{" "}
          <a href="/terms" target="_blank" className="underline hover:text-muted-foreground">terms</a>.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-foreground/70 mb-1 block">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full h-10 px-3 rounded-lg bg-foreground/[0.035] border border-foreground/[0.08] text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#6f8aab]/30 focus:border-[#6f8aab]/40 transition-colors"
      />
    </label>
  );
}
