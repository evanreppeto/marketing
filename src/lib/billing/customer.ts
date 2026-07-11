import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { getStripeClient } from "./stripe";

/**
 * The org's Stripe customer id, creating it on first use. The customer carries
 * `metadata.org_id` so subscription webhooks can map back to the org even before
 * the id is stored, and it's persisted on org_plans for fast lookups.
 */
export async function ensureStripeCustomer(
  input: { orgId: string; email: string | null; name: string | null },
  client?: SupabaseClient,
): Promise<string> {
  const db = client ?? getSupabaseAdminClient();

  const { data } = await db
    .from("org_plans")
    .select("stripe_customer_id")
    .eq("org_id", input.orgId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await getStripeClient().customers.create({
    email: input.email ?? undefined,
    name: input.name ?? undefined,
    metadata: { org_id: input.orgId },
  });

  const { error } = await db
    .from("org_plans")
    .upsert(
      { org_id: input.orgId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) throw new Error(`org_plans customer link: ${error.message}`);
  return customer.id;
}
