import { describe, expect, it } from "vitest";

import { resolveCampaignCta } from "../campaign-cta";

const SITE = "https://bigshouldersrestoration.com";
const DRAFT = "Hi Jordan,\n\nWe can help.\n\n[ Book a no-obligation assessment ]";

describe("resolveCampaignCta", () => {
  it("resolves the placeholder to a real link on a click channel, keeping the label", () => {
    const out = resolveCampaignCta("email", DRAFT, SITE);
    expect(out.kind).toBe("resolved");
    if (out.kind !== "resolved") return;
    expect(out.body).toContain("Book a no-obligation assessment: https://bigshouldersrestoration.com");
    // The rest of the copy is untouched.
    expect(out.body).toContain("Hi Jordan,");
  });

  it("does the same for a landing_page asset", () => {
    expect(resolveCampaignCta("landing_page", DRAFT, SITE).kind).toBe("resolved");
  });

  it("leaves non-click channels alone (sms/social/one_pager never link)", () => {
    for (const t of ["sms", "social_ad", "one_pager", "image_prompt"]) {
      expect(resolveCampaignCta(t, DRAFT, SITE)).toEqual({ kind: "not_applicable" });
    }
  });

  it("flags missing_destination when the brand site is unset — this is prod today", () => {
    // BSR's business_profiles.website_url is null. The CTA must not silently ship a
    // dead button; it surfaces so the operator sees exactly why.
    for (const site of [null, undefined, "", "   ", "not-a-url", "bigshouldersrestoration.com"]) {
      const out = resolveCampaignCta("email", DRAFT, site);
      expect(out.kind).toBe("missing_destination");
      if (out.kind === "missing_destination") expect(out.reason).toMatch(/brand website|destination/i);
    }
  });

  it("flags a click-channel draft that has no CTA placeholder at all", () => {
    const out = resolveCampaignCta("email", "Hi Jordan,\n\nWe can help. Call us.", SITE);
    expect(out.kind).toBe("missing_destination");
    if (out.kind === "missing_destination") expect(out.reason).toMatch(/no call-to-action link/i);
  });

  it("leaves a body that already links somewhere real untouched", () => {
    for (const body of [
      "Click here: https://bigshouldersrestoration.com/book",
      "See [our site](https://bigshouldersrestoration.com).",
      'Visit <a href="https://x.com">us</a>.',
    ]) {
      expect(resolveCampaignCta("email", body, SITE)).toEqual({ kind: "not_applicable" });
    }
  });

  it("is idempotent — resolving an already-resolved body is a no-op", () => {
    const once = resolveCampaignCta("email", DRAFT, SITE);
    if (once.kind !== "resolved") throw new Error("expected resolved");
    expect(resolveCampaignCta("email", once.body, SITE)).toEqual({ kind: "not_applicable" });
  });
});
