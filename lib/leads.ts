import { getStore } from "@netlify/blobs";

/**
 * Lead capture storage (Netlify Blobs, store: "leads").
 *
 * Captures name + role + company + email after the user's first free
 * audit, so every returning user becomes a qualified inbound contact
 * for Two Point Technologies. This is explicitly NOT full auth — no
 * passwords, no sessions, no email verification yet. Just capture.
 *
 * Storage layout:
 *   lead:<normalized-email>   — latest submitted Lead for that email
 *   log:<iso-timestamp>:<rand> — full history of every submission (we
 *                               want to know repeat signups, different
 *                               roles for the same email, etc.)
 */

export interface Lead {
  name: string;
  role: string;
  company: string;
  email: string;
  /** URL/slug of the audit that triggered the gate (if known). */
  sourceAuditSlug?: string;
  /** Browser user-agent from the signup request (debug / spam hints). */
  userAgent?: string;
  /** ISO timestamp of this submission. */
  createdAt: string;
}

const STORE_NAME = "leads";

function getLeadsStore() {
  return getStore({ name: STORE_NAME });
}

/** Normalize emails so "Sam@Example.com " and "sam@example.com" collide. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Light regex — we don't need RFC-5322 strict, just spam-basic. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SaveLeadInput {
  name: string;
  role: string;
  company: string;
  email: string;
  sourceAuditSlug?: string;
  userAgent?: string;
}

export interface SaveLeadResult {
  ok: true;
  lead: Lead;
}

export interface SaveLeadError {
  ok: false;
  error: string;
}

/**
 * Persist a lead submission. Overwrites `lead:<email>` with the latest
 * payload and appends an immutable log entry so we keep the full trail.
 */
export async function saveLead(
  input: SaveLeadInput
): Promise<SaveLeadResult | SaveLeadError> {
  const name = input.name.trim().slice(0, 120);
  const role = input.role.trim().slice(0, 120);
  const company = input.company.trim().slice(0, 120);
  const email = normalizeEmail(input.email);

  if (!name) return { ok: false, error: "Name is required." };
  if (!role) return { ok: false, error: "Role is required." };
  if (!company) return { ok: false, error: "Company is required." };
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "A valid email is required." };
  }

  const lead: Lead = {
    name,
    role,
    company,
    email,
    sourceAuditSlug: input.sourceAuditSlug?.slice(0, 120),
    userAgent: input.userAgent?.slice(0, 400),
    createdAt: new Date().toISOString(),
  };

  try {
    const store = getLeadsStore();
    // Latest submission per email (overwrite).
    await store.setJSON(`lead:${email}`, lead);
    // Append-only history — every submission logged so repeat signups
    // and role/company changes are preserved.
    const logKey = `log:${lead.createdAt}:${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(logKey, lead);
  } catch (e) {
    console.error("[leads] save failed:", e);
    return { ok: false, error: "Could not save your details. Try again." };
  }

  return { ok: true, lead };
}

/** Lookup the most recent lead for a given email. Returns null if unknown. */
export async function getLead(email: string): Promise<Lead | null> {
  try {
    const store = getLeadsStore();
    const data = await store.get(`lead:${normalizeEmail(email)}`, {
      type: "json",
    });
    return (data as Lead) ?? null;
  } catch {
    return null;
  }
}
