import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe";
import { applyStripeSubscriptionUpdate, planUpdateForSubscription } from "@/lib/billing/subscription-sync";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Stripe subscription webhook. NOT operator-gated (proxy skips /api) — authenticated
 * by the Stripe signature (STRIPE_WEBHOOK_SECRET). Syncs subscription price → plan
 * tier and status into org_plans via the service role. Idempotent.
 *
 *   POST /api/webhooks/stripe   Stripe-Signature: <sig>
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isStripeConfigured() || !isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "no_webhook_secret" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(raw, signature ?? "", secret);
  } catch {
    // Bad/missing signature — reject so Stripe retries and nothing spoofed lands.
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = (sub.metadata?.org_id ?? "").trim() || null;
      const update = planUpdateForSubscription({
        // A delete event may still report the prior status; treat it as canceled.
        status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
        priceId: sub.items?.data?.[0]?.price?.id ?? null,
        subscriptionId: sub.id,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        currentPeriodEnd: (sub as unknown as { current_period_end?: number }).current_period_end ?? null,
      });
      const result = await applyStripeSubscriptionUpdate({ orgId, update }, getSupabaseAdminClient());
      if (!result.ok) {
        // 500 so Stripe retries; the update is idempotent.
        return NextResponse.json({ ok: false, error: "sync_failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, received: true });
  } catch {
    return NextResponse.json({ ok: false, error: "handler_error" }, { status: 500 });
  }
}
