"use client";

import { useState } from "react";
import type { FixedCost } from "@/lib/finances";

/**
 * Inline CRUD for the fixed-costs list. POSTs the entire array on
 * save (the lib supports merge-by-replace, not partial updates, which
 * keeps this form trivially simple). Reloads on success so the totals
 * recompute server-side.
 *
 * Each row: label + monthly $ + optional notes + delete.
 * Add-row button at the bottom.
 */

interface RowDraft extends FixedCost {
  /** Local-only field for the input text since users type
   *  partial numbers. We coerce to number on save. */
  monthlyInput: string;
}

function makeDraft(c?: FixedCost): RowDraft {
  return {
    id: c?.id ?? crypto.randomUUID(),
    label: c?.label ?? "",
    monthlyUsd: c?.monthlyUsd ?? 0,
    monthlyInput: (c?.monthlyUsd ?? 0).toFixed(2),
    notes: c?.notes,
  };
}

export function FixedCostsForm({
  token,
  initial,
}: {
  token: string;
  initial: FixedCost[];
}) {
  const [rows, setRows] = useState<RowDraft[]>(
    initial.length > 0
      ? initial.map((c) => makeDraft(c))
      : [
          // Pre-seed with common rows on first use so the operator has
          // hints rather than a blank slate. They can edit/delete any.
          makeDraft({
            id: crypto.randomUUID(),
            label: "Netlify (Pro plan)",
            monthlyUsd: 19,
          }),
          makeDraft({
            id: crypto.randomUUID(),
            label: "chedder.2pt.ai domain",
            monthlyUsd: 1.5,
            notes: "~$18/yr amortized",
          }),
        ]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(id: string, patch: Partial<RowDraft>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeDraft()]);
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    // Coerce inputs to numbers, drop empty-label rows.
    const items: FixedCost[] = rows
      .filter((r) => r.label.trim().length > 0)
      .map((r) => ({
        id: r.id,
        label: r.label.trim(),
        monthlyUsd: parseFloat(r.monthlyInput) || 0,
        notes: r.notes?.trim() || undefined,
      }));
    try {
      const res = await fetch(
        `/api/admin/finances?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "fixed_costs", items }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Save failed.");
        setSaving(false);
        return;
      }
      setSaved(true);
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setError("Could not reach our servers.");
      setSaving(false);
    }
  }

  const total = rows.reduce(
    (acc, r) => acc + (parseFloat(r.monthlyInput) || 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-foreground/[0.06] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-foreground/[0.03] text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
            <tr>
              <th className="text-left font-semibold p-3 w-2/5">Label</th>
              <th className="text-left font-semibold p-3 w-[110px]">$/month</th>
              <th className="text-left font-semibold p-3">Notes</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-4 text-[13px] text-muted-foreground/70 text-center"
                >
                  No fixed costs yet. Add one below.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-foreground/[0.06] align-middle"
                >
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) =>
                        updateRow(row.id, { label: e.target.value })
                      }
                      placeholder="e.g. Netlify Pro"
                      className="w-full h-9 px-2.5 rounded-md bg-foreground/[0.03] border border-foreground/[0.08] text-[13px] focus:outline-none focus:border-[var(--brand-coral)]/40 transition-colors"
                    />
                  </td>
                  <td className="p-2">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground/60 tabular-nums">
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={row.monthlyInput}
                        onChange={(e) =>
                          updateRow(row.id, { monthlyInput: e.target.value })
                        }
                        className="w-full h-9 pl-6 pr-2 rounded-md bg-foreground/[0.03] border border-foreground/[0.08] text-[13px] tabular-nums focus:outline-none focus:border-[var(--brand-coral)]/40 transition-colors"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.notes ?? ""}
                      onChange={(e) =>
                        updateRow(row.id, { notes: e.target.value })
                      }
                      placeholder="optional"
                      className="w-full h-9 px-2.5 rounded-md bg-foreground/[0.03] border border-foreground/[0.08] text-[12.5px] text-muted-foreground focus:outline-none focus:border-[var(--brand-coral)]/40 transition-colors"
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => deleteRow(row.id)}
                      aria-label={`Delete ${row.label}`}
                      className="w-8 h-8 rounded-md text-muted-foreground/60 hover:text-[var(--brand-terracotta-dark)] hover:bg-[var(--brand-terracotta)]/[0.07] transition-colors flex items-center justify-center"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-foreground/[0.08] bg-foreground/[0.02]">
              <td className="p-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                Total
              </td>
              <td className="p-3 text-[14px] font-semibold tabular-nums text-foreground">
                ${total.toFixed(2)}
              </td>
              <td className="p-3 text-[11.5px] text-muted-foreground/70">
                = ${(total / 30.4).toFixed(2)}/day amortized
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="text-[13px] font-medium text-[var(--brand-coral-dark)] hover:text-[var(--brand-coral)] transition-colors inline-flex items-center gap-1.5"
        >
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a cost
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 px-4 rounded-lg bg-foreground text-background font-semibold text-[13px] tracking-[-0.01em] disabled:opacity-60 hover:bg-foreground/90 active:scale-[0.99] transition-all duration-150"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save all"}
        </button>
      </div>

      {error && (
        <p className="text-[12.5px] text-[var(--brand-terracotta-dark)] bg-[var(--brand-terracotta)]/[0.07] border border-[var(--brand-terracotta)]/[0.18] rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
