import { getStore } from "@netlify/blobs";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";

/**
 * Magic-link authentication backed by Netlify Blobs.
 *
 * Why not a DB? Auth for Chedder today is low volume, append-mostly, and
 * the storage requirements (one-time tokens + sessions) fit cleanly into
 * KV. When Chedder outgrows that we'll move to Postgres; until then this
 * keeps us on one storage system we already run.
 *
 * Token lifecycle:
 *   1. User submits email → /api/auth/send-link
 *   2. We create a single-use token T, store hashed(T) in "auth:tokens" with
 *      a 15-min expiry, then email the user a URL containing T
 *   3. User clicks link → /api/auth/verify?token=T
 *   4. We look up hashed(T), delete it (one-shot), create a session S
 *      stored in "auth:sessions", set it as an httpOnly cookie, redirect
 *   5. Server components call getCurrentUser() which reads the cookie,
 *      validates S in blob storage, and returns the user email
 *
 * Cookie name: chedder_session
 * Session TTL: 30 days (sliding — each successful verify bumps it)
 */

const STORE_NAME = "auth";
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = "chedder_session";

function getAuthStore() {
  return getStore({ name: STORE_NAME });
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

interface TokenRecord {
  email: string;
  createdAt: number;
  expiresAt: number;
}

interface SessionRecord {
  email: string;
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
}

/**
 * Generate a magic-link token for the given email and persist its hash.
 * Returns the plaintext token — caller emails this to the user. The
 * plaintext is never stored server-side.
 */
export async function createMagicLinkToken(
  email: string
): Promise<{ token: string; expiresAt: number }> {
  const normalized = normalizeEmail(email);
  const token = randomBytes(32).toString("base64url");
  const hash = hashToken(token);
  const now = Date.now();
  const record: TokenRecord = {
    email: normalized,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  };
  const store = getAuthStore();
  await store.setJSON(`token:${hash}`, record);
  return { token, expiresAt: record.expiresAt };
}

/**
 * Verify a token and consume it. Returns the email it was issued for, or
 * null if the token is unknown, expired, or already used.
 */
export async function consumeMagicLinkToken(
  token: string
): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const hash = hashToken(token);
  const store = getAuthStore();
  const key = `token:${hash}`;
  try {
    const record = (await store.get(key, { type: "json" })) as
      | TokenRecord
      | null;
    if (!record) return null;
    // Always delete on read — one-shot use.
    await store.delete(key).catch(() => {});
    if (Date.now() > record.expiresAt) return null;
    return record.email;
  } catch {
    return null;
  }
}

/**
 * Start a new session for an email. Returns the session ID which the
 * caller should set as an httpOnly cookie.
 */
export async function createSession(
  email: string,
  userAgent?: string
): Promise<{ sessionId: string; expiresAt: number }> {
  const normalized = normalizeEmail(email);
  const sessionId = randomBytes(32).toString("base64url");
  const now = Date.now();
  const record: SessionRecord = {
    email: normalized,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: userAgent?.slice(0, 300),
  };
  const store = getAuthStore();
  await store.setJSON(`session:${sessionId}`, record);
  return { sessionId, expiresAt: record.expiresAt };
}

/**
 * Look up a session by ID. Returns the email if valid and unexpired,
 * null otherwise. Does not bump the expiry — call refreshSession() for
 * sliding-window behavior.
 */
export async function readSession(sessionId: string): Promise<string | null> {
  if (!sessionId || sessionId.length < 20) return null;
  const store = getAuthStore();
  try {
    const record = (await store.get(`session:${sessionId}`, {
      type: "json",
    })) as SessionRecord | null;
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      // Best-effort cleanup — don't block auth on it
      void store.delete(`session:${sessionId}`).catch(() => {});
      return null;
    }
    return record.email;
  } catch {
    return null;
  }
}

/**
 * Delete a session (logout).
 */
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const store = getAuthStore();
  try {
    await store.delete(`session:${sessionId}`);
  } catch {
    // ignore
  }
}

/**
 * Convenience: read the session cookie from the current request and
 * return the logged-in user's email. Server components and server
 * actions only — this uses next/headers which is request-scoped.
 */
export async function getCurrentUser(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const c = cookieStore.get(SESSION_COOKIE);
    if (!c?.value) return null;
    return await readSession(c.value);
  } catch {
    return null;
  }
}

/** Cookie options for the session cookie. */
export function sessionCookieOptions(expiresAt: number) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export { SESSION_COOKIE };
