import { PLAN_TIERS, type PlanTier } from "@/domain";

// Plan tier ↔ Stripe Price id mapping. Prices are created in the Stripe dashboard
// and referenced by env, so the catalog (src/domain/plans.ts) stays the source of
// truth for caps while Stripe owns the money side. `free` has no price.

const PRICE_ENV: Record<Exclude<PlanTier, "free">, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  scale: "STRIPE_PRICE_SCALE",
};

/** The configured Stripe Price id for a paid tier, or null (free / unconfigured). */
export function priceIdForTier(tier: PlanTier): string | null {
  if (tier === "free") return null;
  return process.env[PRICE_ENV[tier]]?.trim() || null;
}

/** Reverse lookup: the tier a Stripe Price id maps to, or null if unknown. */
export function tierForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  for (const tier of PLAN_TIERS) {
    if (tier === "free") continue;
    if (priceIdForTier(tier) === priceId) return tier;
  }
  return null;
}

/** Paid tiers that have a configured price (what the UI can offer for checkout). */
export function purchasableTiers(): PlanTier[] {
  return PLAN_TIERS.filter((tier) => tier !== "free" && priceIdForTier(tier) !== null);
}
