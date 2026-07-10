import { describe, expect, it } from "vitest";

import { isSendableEmail, summarizeCampaignAudience, type AudienceContact } from "@/domain";

const contact = (over: Partial<AudienceContact>): AudienceContact => ({
  id: "c",
  name: "Contact",
  email: "a@b.com",
  status: "active",
  ...over,
});

describe("isSendableEmail", () => {
  it("accepts a plausible address and rejects blanks/garbage", () => {
    expect(isSendableEmail("jordan@acme.com")).toBe(true);
    expect(isSendableEmail("  jordan@acme.com  ")).toBe(true);
    expect(isSendableEmail("")).toBe(false);
    expect(isSendableEmail(null)).toBe(false);
    expect(isSendableEmail(undefined)).toBe(false);
    expect(isSendableEmail("not-an-email")).toBe(false);
    expect(isSendableEmail("a@b")).toBe(false);
  });
});

describe("summarizeCampaignAudience", () => {
  it("counts matched vs sendable and samples only sendable recipients (in order)", () => {
    const contacts = [
      contact({ id: "1", email: "a@x.com" }),
      contact({ id: "2", email: null }),
      contact({ id: "3", email: "bad" }),
      contact({ id: "4", email: "c@y.com" }),
    ];
    const s = summarizeCampaignAudience("persona_landlord", contacts, 8);
    expect(s.persona).toBe("persona_landlord");
    expect(s.matched).toBe(4);
    expect(s.sendable).toBe(2);
    expect(s.sample.map((c) => c.id)).toEqual(["1", "4"]);
  });

  it("caps the sample at sampleSize", () => {
    const contacts = Array.from({ length: 20 }, (_, i) => contact({ id: String(i), email: `u${i}@x.com` }));
    const s = summarizeCampaignAudience("persona_landlord", contacts, 5);
    expect(s.sendable).toBe(20);
    expect(s.sample).toHaveLength(5);
  });

  it("handles an empty audience", () => {
    expect(summarizeCampaignAudience("persona_landlord", [])).toEqual({
      persona: "persona_landlord",
      matched: 0,
      sendable: 0,
      sample: [],
    });
  });
});
