import { NextResponse } from "next/server";

import { optOutAnonymousId } from "@/lib/journey/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * POST /api/v1/journey/opt-out — a visitor's "stop tracking me, and forget what
 * you have". Body: { anonymousId }.
 *
 * Deletes every touchpoint collected against that anonymous id and tombstones its
 * identities so future collector beacons are dropped (see optOutAnonymousId).
 *
 * Public and unauthenticated by design: the anonymous id is a random uuid that
 * only the visitor's own browser holds, so possessing it is the authorization —
 * and no campaign token is required, because opting out must never be harder than
 * being tracked. It is idempotent and always reports success, so the endpoint
 * can't be used to probe whether a given id was ever seen.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, 400);
  }

  const anonymousId =
    payload && typeof payload === "object" && typeof (payload as { anonymousId?: unknown }).anonymousId === "string"
      ? (payload as { anonymousId: string }).anonymousId
      : null;
  if (!anonymousId || anonymousId.length < 8 || anonymousId.length > 128) {
    return json({ ok: false, status: "rejected", message: "A valid anonymousId is required." }, 400);
  }

  if (!isSupabaseAdminConfigured()) {
    // Nothing was ever stored in this environment — the opt-out already holds.
    return json({ ok: true, status: "opted_out", identities: 0, touchpointsDeleted: 0 }, 202);
  }

  try {
    const result = await optOutAnonymousId({ supabase: getSupabaseAdminClient(), anonymousId });
    return json({ ok: true, status: "opted_out", ...result }, 200);
  } catch (error) {
    return json({ ok: false, status: "failed", message: error instanceof Error ? error.message : "Opt-out failed." }, 502);
  }
}

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
