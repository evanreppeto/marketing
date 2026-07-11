import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyStripeSubscriptionUpdate, planUpdateForSubscription } from "./subscription-sync";

const ORIG = process.env.STRIPE_PRICE_PRO;
beforeEach(() => {
  process.env.STRIPE_PRICE_PRO = "price_pro";
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.STRIPE_PRICE_PRO;
  else process.env.STRIPE_PRICE_PRO = ORIG;
});

const base = { priceId: "price_pro", subscriptionId: "sub_1", customerId: "cus_1", currentPeriodEnd: null as number | null };

describe("planUpdateForSubscription", () => {
  it("an active subscription resolves to the price's tier", () => {
    const u = planUpdateForSubscription({ ...base, status: "active", currentPeriodEnd: 1_893_456_000 });
    expect(u.plan_tier).toBe("pro");
    expect(u.subscription_status).toBe("active");
    expect(u.stripe_subscription_id).toBe("sub_1");
    expect(u.stripe_customer_id).toBe("cus_1");
    expect(u.current_period_end).toBe(new Date(1_893_456_000 * 1000).toISOString());
  });

  it("past_due keeps the paid tier (grace window)", () => {
    expect(planUpdateForSubscription({ ...base, status: "past_due" }).plan_tier).toBe("pro");
  });

  it("canceled downgrades to free", () => {
    expect(planUpdateForSubscription({ ...base, status: "canceled" }).plan_tier).toBe("free");
  });

  it("an unknown price downgrades to free even when active (never grants unmapped access)", () => {
    expect(planUpdateForSubscription({ ...base, status: "active", priceId: "price_zzz" }).plan_tier).toBe("free");
  });

  it("a null current_period_end stays null", () => {
    expect(planUpdateForSubscription({ ...base, status: "active" }).current_period_end).toBeNull();
  });
});

describe("applyStripeSubscriptionUpdate", () => {
  const update = {
    plan_tier: "pro" as const,
    subscription_status: "active",
    stripe_subscription_id: "sub_1",
    stripe_customer_id: "cus_1",
    current_period_end: null,
  };

  it("upserts by org_id when Stripe metadata carries one", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = { from: () => ({ upsert }) } as never;
    const res = await applyStripeSubscriptionUpdate({ orgId: "org-9", update }, client);
    expect(res.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: "org-9", plan_tier: "pro" }), { onConflict: "org_id" });
  });

  it("falls back to matching the stored customer id when there's no org metadata", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update_ = vi.fn(() => ({ eq }));
    const client = { from: () => ({ update: update_ }) } as never;
    const res = await applyStripeSubscriptionUpdate({ orgId: null, update }, client);
    expect(res.ok).toBe(true);
    expect(eq).toHaveBeenCalledWith("stripe_customer_id", "cus_1");
  });

  it("reports failure on a DB error", async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { message: "boom" } }) }) } as never;
    const res = await applyStripeSubscriptionUpdate({ orgId: "org-9", update }, client);
    expect(res).toEqual({ ok: false, reason: "boom" });
  });
});
