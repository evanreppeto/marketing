import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { priceIdForTier, purchasableTiers, tierForPriceId } from "./stripe-plans";

const KEYS = ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO", "STRIPE_PRICE_SCALE"];
const ORIG: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    ORIG[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (ORIG[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG[k];
  }
});

describe("stripe-plans", () => {
  it("free has no price; unconfigured paid tiers resolve to null", () => {
    expect(priceIdForTier("free")).toBeNull();
    expect(priceIdForTier("pro")).toBeNull();
    expect(purchasableTiers()).toEqual([]);
  });

  it("maps configured price ids both directions and lists purchasable tiers", () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_PRICE_PRO = "price_pro";

    expect(priceIdForTier("starter")).toBe("price_starter");
    expect(tierForPriceId("price_pro")).toBe("pro");
    expect(tierForPriceId("price_unknown")).toBeNull();
    expect(tierForPriceId(null)).toBeNull();
    expect(purchasableTiers()).toEqual(["starter", "pro"]); // scale unset → excluded
  });
});
