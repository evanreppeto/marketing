import { NextResponse } from "next/server";

import { parseResendWebhookEvent } from "@/domain";
import { recordResendWebhookEvent, verifySvixSignature } from "@/lib/dispatch/resend-webhook";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Resend engagement webhook. NOT operator-gated (proxy skips /api) —
 * authenticated by the svix signature (RESEND_WEBHOOK_SECRET, from the
 * endpoint's settings in the Resend dashboard). Records delivered / opened /
 * clicked / bounced / complained against the dispatch that sent the email, so
 * the journey, performance, and exemplar loops finally receive inbound fuel.
 * Idempotent per svix message id; unknown events and unknown message ids are
 * acknowledged so svix stops retrying.
 *
 *   POST /api/webhooks/resend   svix-id / svix-timestamp / svix-signature
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "no_webhook_secret" }, { status: 503 });

  const svixId = request.headers.get("svix-id");
  const raw = await request.text();

  const verified = verifySvixSignature({
    secret,
    id: svixId,
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    payload: raw,
  });
  // Bad/missing signature — reject so nothing spoofed lands (svix will retry a
  // transient misconfiguration; a spoofer just gets 400s).
  if (!verified || !svixId) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event = parseResendWebhookEvent(body);
  // Unknown/unhandled event shapes are acknowledged: they're authentic (signed),
  // just not something the app records — retrying would never change that.
  if (!event) return NextResponse.json({ ok: true, recorded: false });

  const result = await recordResendWebhookEvent({ event, externalEventId: svixId }, getSupabaseAdminClient());
  if (!result.ok) {
    // A real write failure — 500 so svix redelivers once the DB hiccup passes.
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: result.recorded });
}
