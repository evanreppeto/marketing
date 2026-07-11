// Pure, deterministic plan catalog + cap math. No I/O. The persisted per-org
// choice lives in `public.org_plans`; enforcement reads these caps against the
// `ai_usage_events` ledger (see src/lib/billing/entitlements.ts).
//
// Model: the platform pays all provider API credits (Claude + Gemini) and bills
// each tenant. A plan sets a monthly spend cap (in cents, matching the ledger's
// estimated `cost_estimate_cents`). Amounts are placeholders — tune freely; the
// enforcement mechanism doesn't change.

export type PlanTier = "free" | "starter" | "pro" | "scale";

export type PlanDefinition = {
  tier: PlanTier;
  label: string;
  /** Monthly AI-spend cap in cents (estimated provider cost we bill against). */
  monthlyCapCents: number;
};

export const PLAN_TIERS: readonly PlanTier[] = ["free", "starter", "pro", "scale"];

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: { tier: "free", label: "Free", monthlyCapCents: 1_000 }, // $10
  starter: { tier: "starter", label: "Starter", monthlyCapCents: 10_000 }, // $100
  pro: { tier: "pro", label: "Pro", monthlyCapCents: 50_000 }, // $500
  scale: { tier: "scale", label: "Scale", monthlyCapCents: 200_000 }, // $2,000
};

/** Tier assumed for an org with no explicit plan row. */
export const DEFAULT_PLAN_TIER: PlanTier = "free";

/** Coerce an untrusted value (DB text, input) to a known tier, else the default. */
export function normalizePlanTier(value: unknown): PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value)
    ? (value as PlanTier)
    : DEFAULT_PLAN_TIER;
}

export function planForTier(tier: PlanTier): PlanDefinition {
  return PLANS[tier] ?? PLANS[DEFAULT_PLAN_TIER];
}

/**
 * The effective monthly cap for a tier, honoring a per-org override (e.g. a
 * negotiated limit stored in org_plans.monthly_cap_cents). A non-positive or
 * missing override falls back to the tier default.
 */
export function planCapCents(tier: PlanTier, overrideCents?: number | null): number {
  if (typeof overrideCents === "number" && overrideCents > 0) return overrideCents;
  return planForTier(tier).monthlyCapCents;
}
