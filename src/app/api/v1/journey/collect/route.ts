import { NextResponse } from "next/server";

import { parseJourneyCollect } from "@/domain";
import { recordCollectedTouch, resolveCollectOrg } from "@/lib/journey/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * POST /api/v1/journey/collect — first-party anonymous journey collector (P1).
 *
 * Called by landing pages we control to record pre-identification touches
 * (impressions, clicks, visits) against an anonymous_id before the visitor is a
 * known contact. This is inbound observation only — it never sends anything and
 * never touches the approval gate.
 *
 * There is deliberately no bearer token (anonymous browsers can't hold one). The
 * gate is that every touch must carry a valid campaign token that resolves to a
 * real campaign/org; the org is taken from that server-side lookup, never the
 * body, and a conversion can never be recorded here (see parseJourneyCollect /
 * the journey_touchpoints is_conversion default). Rate limiting is left to the
 * edge/infra layer.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, status: "rejected", errors: [{ path: "(root)", message: "Request body must be valid JSON." }] }, 400);
  }

  const parsed = parseJourneyCollect(payload);
  if (!parsed.ok) {
    return json({ ok: false, status: "rejected", errors: parsed.errors }, 400);
  }

  if (!isSupabaseAdminConfigured()) {
    // No persistence in this environment — accept-and-drop so a landing page
    // integration can be wired before the backend is connected (mirrors ingest).
    return json({ ok: true, status: "not_configured", anonymousId: parsed.value.anonymousId ?? null }, 202);
  }

  try {
    const supabase = getSupabaseAdminClient();
    const resolved = await resolveCollectOrg(supabase, parsed.value);
    if (!resolved) {
      return json({ ok: false, status: "unresolved", errors: [{ path: "token", message: "Token did not resolve to a known campaign." }] }, 400);
    }

    const recorded = await recordCollectedTouch({ supabase, resolved, input: parsed.value });
    const res = json({ ok: true, status: "recorded", anonymousId: recorded.anonymousId, deduped: recorded.deduped }, recorded.deduped ? 200 : 201);
    // First-party visitor cookie so a returning browser reuses its id (readable by
    // the landing page so it can attach the id to the lead form for the stitch).
    res.cookies.set("bsg_aid", recorded.anonymousId, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return res;
  } catch (error) {
    return json({ ok: false, status: "failed", errors: [{ path: "(root)", message: error instanceof Error ? error.message : "Collector write failed." }] }, 502);
  }
}

// CORS: the collector is called cross-origin from first-party landing pages. The
// visitor id travels in the body (not a credentialed cookie), so a wildcard origin
// is safe — no credentials are shared.
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}
