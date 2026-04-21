import { NextRequest, NextResponse } from "next/server";
import { notifyContactSubmission, sendAuditPdf } from "@/lib/email";
import { getAudit } from "@/lib/audit-store";
import { generateAuditPDF } from "@/lib/generate-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Contact API endpoint.
 *
 * Accepts lead data from the PDF-download popup and any other contact
 * surfaces. Fires an email notification to sam@twopointtechnologies.com
 * (via lib/email.ts) so new leads hit the inbox immediately. Also
 * forwards to Netlify Forms as a belt-and-braces capture (Netlify Forms
 * needs a static form declaration to route correctly, so treat it as a
 * best-effort redundant copy rather than the primary notification).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      website,
      message,
      score,
      source = "contact",
      company,
      slug,
    } = body as {
      name?: string;
      email?: string;
      website?: string;
      message?: string;
      score?: number;
      source?: "contact" | "pdf-download";
      company?: string;
      slug?: string;
    };

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Log the lead server-side so it appears in Netlify function logs
    console.log("=== NEW CHEDDER LEAD ===");
    console.log(`Source: ${source}`);
    console.log(`Name: ${name}`);
    console.log(`Email: ${email}`);
    console.log(`Website: ${website || "N/A"}`);
    console.log(`Score: ${score ?? "N/A"}`);
    console.log(`Company: ${company || "N/A"}`);
    console.log(`Message: ${message || "(none)"}`);
    console.log("========================");

    // Fire-and-forget email notification to NOTIFY_EMAIL (sam@twopointtechnologies.com).
    // No-op if RESEND_API_KEY isn't set; never blocks the response.
    void notifyContactSubmission({
      name,
      email,
      source,
      website,
      company,
      message,
      score,
    });

    // If this is a PDF-download request, actually email the PDF to the
    // submitter. Regenerate server-side from the saved audit so the
    // client only ships a small JSON payload. We await this one so the
    // client knows whether delivery succeeded.
    let pdfSent = false;
    let pdfError: string | undefined;
    if (source === "pdf-download" && typeof slug === "string" && slug.length > 0) {
      try {
        const audit = await getAudit(slug);
        if (!audit) {
          pdfError = "Audit not found";
        } else {
          // jsPDF output("arraybuffer") → Buffer → base64 (Resend accepts base64)
          const doc = generateAuditPDF(audit);
          const ab = doc.output("arraybuffer") as ArrayBuffer;
          const pdfBase64 = Buffer.from(ab).toString("base64");
          const result = await sendAuditPdf({
            to: email,
            name,
            domain: audit.domain,
            overallScore: audit.overallScore,
            grade: audit.grade,
            pdfBase64,
          });
          pdfSent = result.ok;
          if (!result.ok && !result.skipped) {
            pdfError = result.error || "Send failed";
          }
        }
      } catch (e) {
        pdfError = e instanceof Error ? e.message : "PDF send failed";
        console.error("[contact] PDF email error:", e);
      }
    }

    // Forward to Netlify Forms (server-side)
    // NOTE: This only works on Netlify-hosted sites. URL_RAW or DEPLOY_URL env vars
    // are set automatically by Netlify on every build.
    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.DEPLOY_URL ||
      "https://chedder.2pt.ai";

    const formName = source === "pdf-download" ? "pdf-download" : "contact";
    const formData = new URLSearchParams();
    formData.append("form-name", formName);
    formData.append("name", name);
    formData.append("email", email);
    if (website) formData.append("website", website);
    if (message) formData.append("message", message);
    if (score !== undefined) formData.append("score", String(score));
    if (company) formData.append("company", company);

    let netlifySubmitted = false;
    try {
      const res = await fetch(siteUrl + "/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      });
      netlifySubmitted = res.ok;
      if (!res.ok) {
        console.error(`Netlify form submission failed: HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("Netlify form submission error:", e);
    }

    return NextResponse.json({
      success: true,
      netlifySubmitted,
      pdfSent,
      pdfError,
    });
  } catch (e) {
    console.error("Contact API error:", e);
    return NextResponse.json(
      { error: "Failed to submit" },
      { status: 500 }
    );
  }
}
