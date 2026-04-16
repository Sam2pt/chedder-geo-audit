import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { name, email, website, message, score } = await req.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Build mailto link content for server-side reference
    // In production, replace this with a proper email service (Resend, SendGrid, etc.)
    const subject = `GEO Audit Lead: ${website || "Unknown"} (Score: ${score || "N/A"})`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Website: ${website || "Not provided"}`,
      `GEO Score: ${score || "N/A"}`,
      ``,
      `Message:`,
      message || "No message provided",
    ].join("\n");

    // For now, log the lead (in production, send via email API)
    console.log("=== NEW GEO AUDIT LEAD ===");
    console.log(`To: sam@twopointtechnologies.com`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    console.log("==========================");

    return NextResponse.json({ success: true, mailto: `mailto:sam@twopointtechnologies.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
  } catch {
    return NextResponse.json(
      { error: "Failed to submit" },
      { status: 500 }
    );
  }
}
