import { describe, expect, it } from "vitest";

import { buildCampaignLink } from "../attribution";
import { resolveAttribution } from "../attribution";

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

describe("resolveAttribution", () => {
  it("prefers an explicit valid campaignId (method=explicit)", () => {
    const out = resolveAttribution({ campaignId: CAMPAIGN, campaignAssetId: ASSET, channel: "email" });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, assetId: ASSET, channel: "email", method: "explicit" });
  });

  it("round-trips a bsg_at token from buildCampaignLink (method=token)", () => {
    const link = buildCampaignLink({ destinationUrl: "https://x.com/q", campaignId: CAMPAIGN, assetId: ASSET, channel: "meta_ad" });
    const token = new URL(link).searchParams.get("bsg_at")!;
    const out = resolveAttribution({ token });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, assetId: ASSET, channel: "meta_ad", method: "token" });
  });

  it("falls back to utm_campaign when it is a UUID (method=utm)", () => {
    const out = resolveAttribution({ utmCampaign: CAMPAIGN, utmSource: "google" });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, channel: "google", method: "utm" });
    expect(out.utm.utm_campaign).toBe(CAMPAIGN);
  });

  it("uses the source rule map as the last resort (method=source_rule)", () => {
    const out = resolveAttribution({ source: "spring_postcard" }, { spring_postcard: CAMPAIGN });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, method: "source_rule" });
  });

  it("returns unattributed for unknown / empty / malformed input", () => {
    expect(resolveAttribution({}).method).toBe("unattributed");
    expect(resolveAttribution({ campaignId: "not-a-uuid" }).method).toBe("unattributed");
    expect(resolveAttribution({ token: "@@@not-base64@@@" }).method).toBe("unattributed");
  });
});
