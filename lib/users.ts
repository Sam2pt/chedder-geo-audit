import { getStore } from "@netlify/blobs";
import { getLead } from "./leads";

/**
 * User account storage (Netlify Blobs, store: "users").
 *
 * A User is the persistent identity behind an email — distinct from a
 * Lead (which is the marketing capture) and a Session (which is the
 * short-lived auth cookie). One User per email, mutated over time as
 * audits run and the plan changes.
 *
 * Plan model (decided 2026-05):
 *   • free — 1 free audit after signup, then locked
 *   • pro  — everything: unlimited audits, competitor compare,
 *            PDF export, full history, future weekly auto-audits
 *
 * Stripe fields are optional today and get populated by the webhook
 * once billing is wired. Until then every user is free.
 *
 * Storage layout:
 *   user:<normalized-email>  — single mutable record per email
 *
 * Lazy migration: getOrCreateUser() looks for the user record first,
 * and if it doesn't exist, falls back to the legacy `lead:<email>`
 * record (from lib/leads.ts) and backfills a User from it. This lets
 * everyone who signed up before the plan model went live keep their
 * captured name/role/company without us running a one-shot script.
 */

export type Plan = "free" | "pro";
export type PlanStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | null;

export interface User {
  email: string;
  /** Captured at signup via lead-gate. May be empty for legacy records. */
  name: string;
  role: string;
  company: string;

  /** Current plan tier. Defaults to "free" for any newly-created user. */
  plan: Plan;
  /** How many audits this user has triggered. Free cap is FREE_AUDIT_LIMIT. */
  auditsUsed: number;

  /** Stripe ids — populated by the webhook once a checkout completes. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planStatus?: PlanStatus;
  /** ISO timestamp of the next renewal / end of grace period. */
  planRenewsAt?: string;

  /** ISO timestamps. createdAt is set once; updatedAt on every mutation. */
  createdAt: string;
  updatedAt: string;
}

const STORE_NAME = "users";

/**
 * How many audits a free-tier user gets after signup. Bumped here as a
 * single knob — if we ever do a promo ("3 free audits this week") this
 * is the only place to change.
 */
export const FREE_AUDIT_LIMIT = 1;

function getUsersStore() {
  return getStore({ name: STORE_NAME });
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function userKey(email: string): string {
  return `user:${normalizeEmail(email)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Read a user by email. Returns null if no record exists. Does not migrate. */
export async function getUser(email: string): Promise<User | null> {
  try {
    const store = getUsersStore();
    const data = await store.get(userKey(email), { type: "json" });
    return (data as User) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a user by email, falling back to lazy migration from the legacy
 * leads store if no user record exists yet. Returns null only if neither
 * a user nor a lead exists for this email.
 *
 * Use this from anywhere that needs a User for an already-known email
 * (e.g. /api/auth/me, audit kickoff, billing pages).
 */
export async function getOrMigrateUser(email: string): Promise<User | null> {
  const existing = await getUser(email);
  if (existing) return existing;

  // No user record yet — check if this email has a lead from before the
  // plan model. If so, backfill a User from it. Legacy leads ran at
  // least one audit (that's how the lead-gate trips), so mark
  // auditsUsed=1 — they've already burned their free slot.
  const lead = await getLead(email);
  if (!lead) return null;

  const migrated: User = {
    email: normalizeEmail(email),
    name: lead.name,
    role: lead.role,
    company: lead.company,
    plan: "free",
    auditsUsed: FREE_AUDIT_LIMIT, // grandfathered as "has used their free audit"
    createdAt: lead.createdAt,
    updatedAt: nowIso(),
  };

  try {
    const store = getUsersStore();
    await store.setJSON(userKey(email), migrated);
  } catch {
    // If the write fails we still return the in-memory record so the
    // request can proceed; the next call will retry the migration.
  }
  return migrated;
}

/**
 * Create a User if one doesn't exist, otherwise update name/role/company
 * from the latest signup. Always sets plan=free for new records — Pro
 * upgrades go through the Stripe webhook, not signup.
 *
 * Called from /api/leads when someone completes the lead-gate. New
 * signups start with auditsUsed=0 (their first audit is on us); legacy
 * leads coming through getOrMigrateUser() start at auditsUsed=1.
 */
export async function upsertUserFromSignup(input: {
  email: string;
  name: string;
  role: string;
  company: string;
}): Promise<User> {
  const email = normalizeEmail(input.email);
  const existing = await getUser(email);
  const now = nowIso();

  const user: User = existing
    ? {
        ...existing,
        // Refresh captured fields if the user updated them in a later
        // signup (e.g. changed role at their company).
        name: input.name.trim().slice(0, 120) || existing.name,
        role: input.role.trim().slice(0, 120) || existing.role,
        company: input.company.trim().slice(0, 120) || existing.company,
        updatedAt: now,
      }
    : {
        email,
        name: input.name.trim().slice(0, 120),
        role: input.role.trim().slice(0, 120),
        company: input.company.trim().slice(0, 120),
        plan: "free",
        auditsUsed: 0,
        createdAt: now,
        updatedAt: now,
      };

  try {
    const store = getUsersStore();
    await store.setJSON(userKey(email), user);
  } catch (e) {
    console.error("[users] upsert failed:", e);
  }
  return user;
}

/**
 * Increment auditsUsed atomically-ish. Read-modify-write with no lock —
 * acceptable here because a single user racing themselves on audits is
 * not a real concern (audits take ~45s, the race window is tiny).
 */
export async function incrementAuditsUsed(email: string): Promise<number> {
  const user = await getOrMigrateUser(email);
  if (!user) return 0;
  const next = user.auditsUsed + 1;
  await writeUser({ ...user, auditsUsed: next, updatedAt: nowIso() });
  return next;
}

/** Internal write helper. Callers use the higher-level mutators above. */
async function writeUser(user: User): Promise<void> {
  try {
    const store = getUsersStore();
    await store.setJSON(userKey(user.email), user);
  } catch (e) {
    console.error("[users] write failed:", e);
  }
}

/**
 * Apply a billing update from a Stripe webhook. Idempotent. Pass only
 * the fields the webhook delivers; the rest stay untouched.
 */
export async function applyBillingUpdate(
  email: string,
  patch: {
    plan?: Plan;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    planStatus?: PlanStatus;
    planRenewsAt?: string;
  }
): Promise<User | null> {
  const user = await getOrMigrateUser(email);
  if (!user) return null;
  const updated: User = {
    ...user,
    ...patch,
    updatedAt: nowIso(),
  };
  await writeUser(updated);
  return updated;
}

/* ── Plan helpers ───────────────────────────────────────────────────
 *
 * Pure functions that take a User (or null for anonymous) and answer
 * "can this user do X?". Keep gates centralized here so the UI and API
 * agree on the rules.
 */

/**
 * Anonymous users (no email captured yet) get their first audit free
 * with no account — that's the current /api/audit/stream path. The
 * lead-gate fires AFTER, captures their details, and creates a User.
 * From that point on this function is the source of truth.
 */
export function canRunNewAudit(user: User | null): boolean {
  if (!user) return true; // anon first audit
  if (user.plan === "pro") return true;
  return user.auditsUsed < FREE_AUDIT_LIMIT;
}

/** Competitor compare is Pro-only. Anon and free users see the padlock. */
export function canCompareCompetitors(user: User | null): boolean {
  return user?.plan === "pro";
}

/** PDF export is Pro-only. */
export function canExportPdf(user: User | null): boolean {
  return user?.plan === "pro";
}

/**
 * The reason a user can't run a new audit, for UI surface text.
 * Returns null if they CAN run one — caller can use this as the gate.
 */
export function newAuditBlockReason(user: User | null): string | null {
  if (canRunNewAudit(user)) return null;
  if (!user) return null; // shouldn't happen, but be safe
  if (user.plan === "free") {
    return `You've used your free audit. Upgrade to Pro to run unlimited audits.`;
  }
  return `Your Pro plan is ${user.planStatus ?? "inactive"}. Update billing to continue.`;
}
