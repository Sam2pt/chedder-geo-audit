import { NextRequest, NextResponse } from "next/server";

/**
 * Contact API endpoint.
 *
 * Accepts lead data and forwards to Netlify Forms via a server-side POST.
 * This is more reliable than browser-only AJAX submissions because:
 *   1. It avoids CORS/browser quirks.
 *   2. It hits the Netlify form endpoint from a server context.
 *   3. We can always log server-side as a fallback.
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
    } = body as {
      name?: string;
      email?: string;
      website?: string;
      message?: string;
      score?: number;
      source?: "contact" | "pdf-download";
      company?: string;
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
    });
  } catch (e) {
    console.error("Contact API error:", e);
    return NextResponse.json(
      { error: "Failed to submit" },
      { status: 500 }
    );
  }
}
