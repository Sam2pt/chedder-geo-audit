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

interface EmailAttachment {
  filename: string;
  /** Base64-encoded file contents. Resend accepts base64 strings. */
  content: string;
  /** Optional MIME type. Resend will guess from the filename if omitted. */
  contentType?: string;
}

interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Either HTML, text, or both. At least one required. */
  html?: string;
  text?: string;
  replyTo?: string;
  /** Optional tags shown in Resend's dashboard for filtering. */
  tags?: Array<{ name: string; value: string }>;
  /** Optional attachments (PDFs, images, etc.). */
  attachments?: EmailAttachment[];
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
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
        })),
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

/**
 * Fire a notification when someone submits the contact form or requests
 * the PDF download. Both surfaces hit /api/contact and both deserve a
 * "hey, someone wants to talk" ping to sam@twopointtechnologies.com.
 * Fire-and-forget, never throws.
 */
export async function notifyContactSubmission(input: {
  name: string;
  email: string;
  source: "contact" | "pdf-download" | string;
  website?: string;
  company?: string;
  message?: string;
  score?: number;
}): Promise<void> {
  const sourceLabel =
    input.source === "pdf-download"
      ? "PDF download"
      : input.source === "contact"
        ? "Contact form"
        : input.source;

  const auditLink = input.website
    ? `https://chedder.2pt.ai/?url=${encodeURIComponent(input.website)}`
    : null;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #1d1d1f;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">🧀 New Chedder contact · ${escapeHtml(sourceLabel)}</h2>
      <table cellpadding="6" style="border-collapse: collapse;">
        <tr><td style="color:#666;">Name</td><td><strong>${escapeHtml(input.name)}</strong></td></tr>
        <tr><td style="color:#666;">Email</td><td><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></td></tr>
        ${input.company ? `<tr><td style="color:#666;">Company</td><td>${escapeHtml(input.company)}</td></tr>` : ""}
        ${input.website ? `<tr><td style="color:#666;">Website</td><td>${auditLink ? `<a href="${auditLink}">${escapeHtml(input.website)}</a>` : escapeHtml(input.website)}</td></tr>` : ""}
        ${typeof input.score === "number" ? `<tr><td style="color:#666;">Score</td><td>${input.score}/100</td></tr>` : ""}
        <tr><td style="color:#666;">Source</td><td>${escapeHtml(sourceLabel)}</td></tr>
        ${input.message ? `<tr><td style="color:#666; vertical-align:top;">Message</td><td style="white-space:pre-wrap;">${escapeHtml(input.message)}</td></tr>` : ""}
      </table>
      <p style="color:#888; font-size:12px; margin-top:24px;">Sent from Chedder · chedder.2pt.ai</p>
    </div>
  `;
  const text =
    `New Chedder contact (${sourceLabel})\n\n` +
    `Name: ${input.name}\n` +
    `Email: ${input.email}\n` +
    (input.company ? `Company: ${input.company}\n` : "") +
    (input.website ? `Website: ${input.website}\n` : "") +
    (typeof input.score === "number" ? `Score: ${input.score}/100\n` : "") +
    (input.message ? `\nMessage:\n${input.message}\n` : "");

  await sendEmail({
    to: getNotifyEmail(),
    subject: `New Chedder ${sourceLabel.toLowerCase()}: ${input.name}${input.company ? ` · ${input.company}` : ""}`,
    html,
    text,
    replyTo: input.email,
    tags: [
      { name: "type", value: "contact_submission" },
      { name: "source", value: (input.source || "contact").slice(0, 40) },
    ],
  }).catch(() => {
    // never throw from a notify
  });
}

/**
 * Deliver the audit PDF to the requester. Called after they enter their
 * name + email in the PDF-download popup. PDF is generated server-side
 * from the saved audit so the client payload stays tiny.
 * Fire-and-forget style; returns the send result so the caller can log.
 */
export async function sendAuditPdf(input: {
  to: string;
  name: string;
  domain: string;
  overallScore: number;
  grade: string;
  pdfBase64: string;
}): Promise<SendEmailResult> {
  const greeting = input.name.trim().split(/\s+/)[0] || "there";
  const viewOnline = `https://chedder.2pt.ai/?url=${encodeURIComponent(input.domain)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; color: #1d1d1f; max-width: 520px; margin: 0 auto; padding: 24px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #FFB800, #E5A500); width: 48px; height: 48px; border-radius: 12px; margin-bottom: 20px;"></div>
      <h2 style="margin: 0 0 12px; font-size: 22px; letter-spacing: -0.02em;">Your Chedder audit for ${escapeHtml(input.domain)}</h2>
      <p style="color: #5a5a60; margin: 0 0 20px;">
        Hey ${escapeHtml(greeting)}, here's the full PDF. Your score is <strong>${input.overallScore}/100</strong> (grade ${escapeHtml(input.grade)}).
      </p>
      <p style="color: #5a5a60; margin: 0 0 24px;">
        The attached PDF has your action plan. If any of it would be faster with help, just reply to this email and we'll take a look.
      </p>
      <a href="${viewOnline}" style="display: inline-block; background: #1d1d1f; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 14px;">Re-run the audit</a>
      <p style="color: #8b8b90; font-size: 12px; margin: 32px 0 0;">Sent from Chedder · chedder.2pt.ai</p>
    </div>
  `;
  const text =
    `Your Chedder audit for ${input.domain}\n\n` +
    `Hey ${greeting}, here's the full PDF. Your score is ${input.overallScore}/100 (grade ${input.grade}).\n\n` +
    `The attached PDF has your action plan. If any of it would be faster with help, just reply to this email.\n\n` +
    `Re-run the audit anytime: ${viewOnline}\n`;

  const safeDomain = input.domain.replace(/[^a-z0-9.-]/gi, "_").slice(0, 60);
  return sendEmail({
    to: input.to,
    subject: `Your Chedder audit · ${input.domain}`,
    html,
    text,
    tags: [
      { name: "type", value: "audit_pdf" },
      { name: "domain", value: safeDomain.slice(0, 40) },
    ],
    attachments: [
      {
        filename: `${safeDomain}-geo-audit.pdf`,
        content: input.pdfBase64,
        contentType: "application/pdf",
      },
    ],
  });
}

/**
 * Send a magic-link sign-in email. If Resend isn't configured, logs the
 * link to the server console and returns skipped:true so local dev still
 * works (the caller can surface the link in a response).
 */
export async function sendMagicLink(input: {
  to: string;
  link: string;
  expiresAt: number;
}): Promise<SendEmailResult> {
  const minutes = Math.max(
    1,
    Math.round((input.expiresAt - Date.now()) / 60000)
  );
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; color: #1d1d1f; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #FFB800, #E5A500); width: 48px; height: 48px; border-radius: 12px; margin-bottom: 20px;"></div>
      <h2 style="margin: 0 0 12px; font-size: 22px; letter-spacing: -0.02em;">Sign in to Chedder</h2>
      <p style="color: #5a5a60; margin: 0 0 24px;">Click the button below to log in. This link expires in ${minutes} minutes and can only be used once.</p>
      <a href="${input.link}" style="display: inline-block; background: #1d1d1f; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; font-size: 14px;">Sign in to Chedder</a>
      <p style="color: #8b8b90; font-size: 12px; margin: 32px 0 0;">Didn't request this? You can ignore this email. Nobody gets signed in without clicking the button.</p>
      <p style="color: #8b8b90; font-size: 12px; margin: 8px 0 0;">Or paste this link: <a href="${input.link}" style="color:#0071e3;">${escapeHtml(input.link)}</a></p>
    </div>
  `;
  const text = `Sign in to Chedder\n\nClick the link below to log in (expires in ${minutes} minutes, one-time use):\n\n${input.link}\n\nDidn't request this? Ignore this email.`;

  if (!process.env.RESEND_API_KEY) {
    // Dev mode — no email provider yet. Log and skip.
    console.log(
      `[auth] Magic link for ${input.to} (no RESEND_API_KEY set): ${input.link}`
    );
    return { ok: false, skipped: true };
  }

  return sendEmail({
    to: input.to,
    subject: "Your Chedder sign-in link",
    html,
    text,
    tags: [{ name: "type", value: "magic_link" }],
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
