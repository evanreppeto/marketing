import { describe, expect, it } from "vitest";

import { parseJourneyCollect } from "../journey-collect";

// A valid RFC-4122 v4 UUID (version nibble 4, variant 8) — zod v4's uuid() checks these.
const CAMPAIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("parseJourneyCollect", () => {
  it("accepts a valid anonymous touch with a campaignId", () => {
    const r = parseJourneyCollect({ campaignId: CAMPAIGN, kind: "ad_click", channel: "meta" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("ad_click");
    expect(r.value.direction).toBe("inbound");
    expect(r.value.campaignId).toBe(CAMPAIGN);
  });

  it("maps an ad impression to outbound reach", () => {
    const r = parseJourneyCollect({ token: "tok", kind: "ad_impression" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.direction).toBe("outbound");
  });

  it("rejects a body with neither token nor campaignId", () => {
    const r = parseJourneyCollect({ kind: "site_visit" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-collectable (conversion) kind", () => {
    const r = parseJourneyCollect({ campaignId: CAMPAIGN, kind: "payment" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === "kind")).toBe(true);
  });

  it("strips query and fragment from the path (no PII in URLs)", () => {
    const r = parseJourneyCollect({ token: "tok", kind: "page_view", path: "/lp/water-damage?email=x@y.com#form" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.path).toBe("/lp/water-damage");
  });

  it("accepts a token alone (no campaignId)", () => {
    const r = parseJourneyCollect({ token: "tok", kind: "site_visit", anonymousId: "anon-12345678" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anonymousId).toBe("anon-12345678");
    expect(r.value.token).toBe("tok");
  });
});
