/**
 * Tiny Resend wrapper. No SDK dependency — we just POST to their REST
 * API so adding email doesn't drag in another package.
 *
 * Env vars:
 *   RESEND_API_KEY     — from https://resend.com/api-keys
 *   RESEND_FROM        — defaults to "Chedder <hello@chedder.2pt.ai>" (needs
 *                        your sending domain verified in Resend first)
 *   NOTIFY_EMAIL       — where internal "new lead" pings go. Defaults to
 *                        sam@twopointtechnologies.com.
 *
 * If RESEND_API_KEY is unset, every call is a no-op (logs once at debug).
 * This keeps local dev and pre-launch deploys from erroring out; once
 * you set the key in Netlify env, notifications start flowing
 * automatically. No code change required.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Either HTML, text, or both. At least one required. */
  html?: string;
  text?: string;
  replyTo?: string;
  /** Optional tags shown in Resend's dashboard for filtering. */
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** True when the send was skipped because no API key was configured. */
  skipped?: boolean;
}

let warnedNoKey = false;

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedNoKey) {
      console.warn(
        "[email] RESEND_API_KEY is not set; email notifications are disabled."
      );
      warnedNoKey = true;
    }
    return { ok: false, skipped: true };
  }

  const from = process.env.RESEND_FROM || "Chedder <hello@chedder.2pt.ai>";

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject.slice(0, 200),
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        tags: input.tags,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[email] Resend rejected send:", res.status, body.slice(0, 300));
      return { ok: false, error: `Resend ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.warn("[email] Send failed:", msg);
    return { ok: false, error: msg };
  }
}

/** Where internal "new lead" / "audit completed" pings should go. */
export function getNotifyEmail(): string {
  return process.env.NOTIFY_EMAIL || "sam@twopointtechnologies.com";
}

/**
 * Fire a "new lead signed up" internal alert. Async, fire-and-forget.
 * Never throws — caller doesn't need to catch.
 */
export async function notifyNewLead(lead: {
  name: string;
  email: string;
  role: string;
  company: string;
  sourceAuditSlug?: string;
}): Promise<void> {
  const permalink = lead.sourceAuditSlug
    ? `https://chedder.2pt.ai/a/${lead.sourceAuditSlug}`
    : null;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #1d1d1f;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">🧀 New Chedder lead</h2>
      <table cellpadding="6" style="border-collapse: collapse;">
        <tr><td style="color:#666;">Name</td><td><strong>${escapeHtml(lead.name)}</strong></td></tr>
        <tr><td style="color:#666;">Email</td><td><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></td></tr>
        <tr><td style="color:#666;">Role</td><td>${escapeHtml(lead.role)}</td></tr>
        <tr><td style="color:#666;">Company</td><td>${escapeHtml(lead.company)}</td></tr>
        ${permalink ? `<tr><td style="color:#666;">Source audit</td><td><a href="${permalink}">${escapeHtml(permalink)}</a></td></tr>` : ""}
      </table>
      <p style="color:#888; font-size:12px; margin-top:24px;">Sent from Chedder · chedder.2pt.ai</p>
    </div>
  `;
  const text =
    `New Chedder lead\n\n` +
    `Name: ${lead.name}\n` +
    `Email: ${lead.email}\n` +
    `Role: ${lead.role}\n` +
    `Company: ${lead.company}\n` +
    (permalink ? `Source audit: ${permalink}\n` : "");

  await sendEmail({
    to: getNotifyEmail(),
    subject: `New Chedder lead: ${lead.name} · ${lead.company}`,
    html,
    text,
    replyTo: lead.email,
    tags: [
      { name: "type", value: "lead_signup" },
      { name: "company", value: lead.company.slice(0, 40) },
    ],
  }).catch(() => {
    // never throw from a notify
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
