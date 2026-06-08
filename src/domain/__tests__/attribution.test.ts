import { describe, expect, it } from "vitest";

import { buildCampaignLink } from "../attribution";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";
const ASSET = "22222222-2222-2222-2222-222222222222";

describe("buildCampaignLink", () => {
  it("stamps utm params and a bsg_at token onto the destination", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/quote", campaignId: CAMPAIGN, channel: "meta_ad" });
    const url = new URL(link);
    expect(url.searchParams.get("utm_campaign")).toBe(CAMPAIGN);
    expect(url.searchParams.get("utm_source")).toBe("meta_ad");
    expect(url.searchParams.get("utm_medium")).toBe("campaign");
    expect(url.searchParams.get("bsg_at")).toBeTruthy();
  });

  it("preserves existing query params on the destination", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/quote?ref=abc", campaignId: CAMPAIGN });
    expect(new URL(link).searchParams.get("ref")).toBe("abc");
  });

  it("defaults utm_source to 'mark' when no channel is given", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/q", campaignId: CAMPAIGN, assetId: ASSET });
    expect(new URL(link).searchParams.get("utm_source")).toBe("mark");
  });

  it("throws when campaignId is not a UUID", () => {
    expect(() => buildCampaignLink({ destinationUrl: "https://x.com", campaignId: "nope" })).toThrow(/UUID/i);
  });
});
