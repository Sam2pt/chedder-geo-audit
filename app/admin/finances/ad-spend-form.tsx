"use client";

import { useState } from "react";

/**
 * Inline form for entering today's and the month's ad spend. POSTs to
 * /api/admin/finances and reloads the page so the new totals render.
 * Token is included via query string — same auth pattern as the admin
 * page itself.
 */
export function AdSpendForm({
  token,
  initialToday,
  initialMonth,
}: {
  token: string;
  initialToday: number;
  initialMonth: number;
}) {
  const [today, setToday] = useState<string>(initialToday.toFixed(2));
  const [month, setMonth] = useState<string>(initialMonth.toFixed(2));
  const [saving, setSaving] = useState<"today" | "month" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<"today" | "month" | null>(null);

  async function save(period: "today" | "month", value: string) {
    setSaving(period);
    setError(null);
    const usd = parseFloat(value);
    if (!Number.isFinite(usd) || usd < 0) {
      setError("Enter a non-negative number.");
      setSaving(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/finances?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, usd }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Save failed.");
        setSaving(null);
        return;
      }
      setSavedAt(period);
      // Reload after a beat so the totals + net margin re-render server-side.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setError("Could not reach our servers.");
      setSaving(null);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field
        label="Today (USD)"
        value={today}
        onChange={setToday}
        onSave={() => save("today", today)}
        saving={saving === "today"}
        saved={savedAt === "today"}
      />
      <Field
        label="This month (USD)"
        value={month}
        onChange={setMonth}
        onSave={() => save("month", month)}
        saving={saving === "month"}
        saved={savedAt === "month"}
      />
      {error && (
        <p className="sm:col-span-2 text-[12.5px] text-[var(--brand-terracotta-dark)] bg-[var(--brand-terracotta)]/[0.07] border border-[var(--brand-terracotta)]/[0.18] rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onSave,
  saving,
  saved,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80 mb-1.5 block">
        {label}
      </span>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground/60 tabular-nums">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 pl-7 pr-3 rounded-lg bg-foreground/[0.03] border border-foreground/[0.1] text-[14px] tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-coral)]/30 focus:border-[var(--brand-coral)]/40 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-10 px-4 rounded-lg bg-foreground text-background font-semibold text-[13px] tracking-[-0.01em] disabled:opacity-60 hover:bg-foreground/90 active:scale-[0.99] transition-all duration-150"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </label>
  );
}
