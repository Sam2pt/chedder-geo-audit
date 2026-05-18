import { NextRequest, NextResponse } from "next/server";
import type { AuditResult } from "@/lib/types";
import { auditSingleUrl } from "@/lib/audit-runner";
import {
  saveAudit,
  getBenchmarks,
  getDomainHistory,
  makeSlug,
} from "@/lib/audit-store";
import {
  checkAuditRateLimit,
  getClientIp,
  rateLimitMessage,
} from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrMigrateUser,
  canRunNewAudit,
  canCompareCompetitors,
  incrementAuditsUsed,
  newAuditBlockReason,
} from "@/lib/users";

// Compare audits fan out to multiple sites in parallel (primary + up to 3
// competitors). Bump the function timeout accordingly.
export const maxDuration = 90;
export const runtime = "nodejs";


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, competitors, deviceId, leadEmail } = body as {
      url: string;
      competitors?: string[];
      deviceId?: string;
      leadEmail?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Rate limit before doing any work — audits are expensive
    // (Brave + Perplexity + OpenAI spend). Signed-up users get a higher
    // ceiling; anonymous callers get a tighter one.
    const rl = await checkAuditRateLimit({
      deviceId: typeof deviceId === "string" ? deviceId : undefined,
      ip: getClientIp(req.headers),
      signedUp: typeof leadEmail === "string" && leadEmail.length > 0,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: rateLimitMessage(rl), resetAt: rl.resetAt },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(
              Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    // Plan gate — signed-in free users who've burned their free audit
    // get 402. Anonymous users still get their first audit free (the
    // lead-gate fires after and turns them into a signed-in free user).
    const sessionEmail = await getCurrentUser();
    const signedInUser = sessionEmail ? await getOrMigrateUser(sessionEmail) : null;
    if (signedInUser && !canRunNewAudit(signedInUser)) {
      return NextResponse.json(
        {
          error: newAuditBlockReason(signedInUser),
          code: "upgrade_required",
          plan: signedInUser.plan,
        },
        { status: 402 }
      );
    }

    // Fan out primary and competitor audits concurrently so the whole
    // compare finishes in roughly max(audit time), not sum. The primary
    // runs the full set of modules including AI + external. Competitors
    // skip AI + external since we only need their on-site signals for
    // the side by side. Competitor compare is Pro-only — strip the list
    // for signed-in free users (UI also padlocks the toggle).
    const allowCompetitors =
      !signedInUser || canCompareCompetitors(signedInUser);
    const validCompetitors = allowCompetitors && Array.isArray(competitors)
      ? competitors
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .slice(0, 3)
      : [];

    const [primary, ...competitorOutcomes] = await Promise.all([
      auditSingleUrl(url),
      ...validCompetitors.map((c) =>
        auditSingleUrl(c, { skipAI: true, skipExternal: true })
      ),
    ]);

    if ("error" in primary) {
      return NextResponse.json({ error: primary.error }, { status: 422 });
    }

    const competitorResults: AuditResult[] = competitorOutcomes.filter(
      (r): r is AuditResult => !("error" in r)
    );

    // Persist + enrich with benchmarks and history.
    // These run in parallel; if blobs aren't available, we degrade silently.
    const slug = makeSlug(primary.domain);
    // Stamp identity on the primary audit so it shows up in the
    // requester's "your recent audits" view and can be linked back to
    // a lead once they've signed up. Competitor audits stay anonymous
    // since they were run for comparison, not for the requester.
    const primaryWithSlug: AuditResult = {
      ...primary,
      slug,
      deviceId: typeof deviceId === "string" ? deviceId : undefined,
      leadEmail: typeof leadEmail === "string" ? leadEmail : undefined,
    };
    const [benchmarks, history] = await Promise.all([
      getBenchmarks(primaryWithSlug),
      getDomainHistory(primary.domain, slug),
    ]);

    const enriched: AuditResult = {
      ...primaryWithSlug,
      benchmarks,
      history,
      competitors: competitorResults,
    };

    // Save (updates benchmarks + appends history) — don't block the response on failure
    await saveAudit(enriched).catch(() => {});

    // Burn one audit slot for signed-in users. Pro users get incremented
    // for analytics but the counter doesn't gate them.
    if (sessionEmail) {
      void incrementAuditsUsed(sessionEmail);
    }

    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 500 }
    );
  }
}
