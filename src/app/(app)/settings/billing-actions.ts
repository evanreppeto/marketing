"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { normalizePlanTier, planForTier, type PlanTier } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { isWorkspaceAdminRole } from "@/lib/auth/workspace-roles";
import { ensureStripeCustomer } from "@/lib/billing/customer";
import { setOrgPlan } from "@/lib/billing/persistence";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe";
import { priceIdForTier } from "@/lib/billing/stripe-plans";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import type { SettingsWriteResult } from "./actions";

/** Checkout/portal actions return a URL for the client to redirect to. */
export type BillingRedirectResult = { ok: true; url: string } | { ok: false; error: string };

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:6001";
}

/** Resolve the caller's admin-gated org context for a billing mutation. */
async function requireBillingAdmin(): Promise<
  { ok: true; orgId: string; role: string } | { ok: false; error: string }
> {
  await requireOperator();
  if (!isStripeConfigured()) return { ok: false, error: "Billing isn't configured." };
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active org." };
  if (!isWorkspaceAdminRole(ctx.role ?? "")) return { ok: false, error: "Only owners and admins can manage billing." };
  return { ok: true, orgId: ctx.orgId, role: ctx.role ?? "" };
}

/**
 * Change the current org's billing plan. Owner/admin only (checked here AND by
 * org_plans RLS). Offline/demo returns success-but-unpersisted so the picker can
 * update optimistically without claiming a real write.
 */
export async function updateOrgPlanAction(input: { tier: string }): Promise<SettingsWriteResult> {
  await requireOperator();
  const tier = normalizePlanTier(input.tier);

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active org to update." };
  if (!isWorkspaceAdminRole(ctx.role ?? "")) {
    return { ok: false, error: "Only owners and admins can change the plan." };
  }

  try {
    await setOrgPlan({ orgId: ctx.orgId, tier });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the plan." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Plan set to ${planForTier(tier).label}.` };
}

/**
 * Start a Stripe Checkout for a paid tier and return the hosted-checkout URL for
 * the client to redirect to. Owner/admin only. The subscription carries
 * metadata.org_id so the webhook can sync it back.
 */
export async function createCheckoutSessionAction(input: { tier: string }): Promise<BillingRedirectResult> {
  const gate = await requireBillingAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const tier = normalizePlanTier(input.tier) as PlanTier;
  const priceId = priceIdForTier(tier);
  if (!priceId) return { ok: false, error: "That plan isn't available for checkout." };

  try {
    const user = await getSupabaseAuthenticatedUser().catch(() => null);
    const customerId = await ensureStripeCustomer({ orgId: gate.orgId, email: user?.email ?? null, name: null });
    const origin = await appOrigin();
    const session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { org_id: gate.orgId } },
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancelled`,
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a checkout URL." };
    return { ok: true, url: session.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not start checkout." };
  }
}

/**
 * Open the Stripe Customer Portal (manage/cancel subscription, update card).
 * Owner/admin only; requires an existing customer.
 */
export async function createBillingPortalAction(): Promise<BillingRedirectResult> {
  const gate = await requireBillingAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const user = await getSupabaseAuthenticatedUser().catch(() => null);
    const customerId = await ensureStripeCustomer({ orgId: gate.orgId, email: user?.email ?? null, name: null });
    const origin = await appOrigin();
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not open the billing portal." };
  }
}
