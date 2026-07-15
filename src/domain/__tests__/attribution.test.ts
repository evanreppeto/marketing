import { describe, expect, it } from "vitest";

import { buildCampaignLink, computeCampaignEconomics, resolveAttribution, stampCampaignLinks } from "../attribution";

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

  it("defaults utm_source to 'arc' when no channel is given", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/q", campaignId: CAMPAIGN, assetId: ASSET });
    expect(new URL(link).searchParams.get("utm_source")).toBe("arc");
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

describe("computeCampaignEconomics", () => {
  it("computes roas/cac/cpl from realized revenue and spend", () => {
    const out = computeCampaignEconomics({ attributedLeads: 10, wonRevenueCents: 400000, wonCount: 2, openPipelineCents: 90000, spendCents: 100000 });
    expect(out.roas).toBeCloseTo(4);
    expect(out.cac).toBe(50000);
    expect(out.cpl).toBe(10000);
    expect(out.realizedRevenueCents).toBe(400000);
    expect(out.pipelineRevenueCents).toBe(90000);
  });

  it("returns null ratios at the zero-divisor edges (never NaN/Infinity)", () => {
    const noSpend = computeCampaignEconomics({ attributedLeads: 5, wonRevenueCents: 100000, wonCount: 1, openPipelineCents: 0, spendCents: 0 });
    expect(noSpend.roas).toBeNull();
    const noWins = computeCampaignEconomics({ attributedLeads: 5, wonRevenueCents: 0, wonCount: 0, openPipelineCents: 0, spendCents: 50000 });
    expect(noWins.cac).toBeNull();
    const noLeads = computeCampaignEconomics({ attributedLeads: 0, wonRevenueCents: 0, wonCount: 0, openPipelineCents: 0, spendCents: 50000 });
    expect(noLeads.cpl).toBeNull();
  });
});

describe("stampCampaignLinks", () => {
  const at = { campaignId: CAMPAIGN, assetId: ASSET, channel: "email" };

  it("tags a first-party href in html and round-trips through resolveAttribution", () => {
    const out = stampCampaignLinks({ html: '<a href="https://bigshoulders.com/quote">Book now</a>' }, at);
    const href = out.html!.match(/href="([^"]+)"/)![1];
    const url = new URL(href);
    expect(url.searchParams.get("utm_campaign")).toBe(CAMPAIGN);
    const resolved = resolveAttribution({ token: url.searchParams.get("bsg_at")! });
    expect(resolved).toMatchObject({ campaignId: CAMPAIGN, assetId: ASSET, channel: "email", method: "token" });
  });

  it("tags a bare url in text and peels trailing punctuation", () => {
    const out = stampCampaignLinks({ text: "Visit https://bigshoulders.com/quote. Thanks!" }, at);
    expect(out.text).toMatch(/bsg_at=/);
    expect(out.text).toMatch(/quote\?[^ ]*\. Thanks!$/); // period stayed outside the link
  });

  it("never tags social, unsubscribe, mailto, or non-http links", () => {
    const html =
      '<a href="https://facebook.com/bsr">fb</a>' +
      '<a href="https://bigshoulders.com/unsubscribe?e=1">unsub</a>' +
      '<a href="mailto:hi@bsr.com">mail</a>' +
      '<a href="tel:+13125551234">call</a>';
    const out = stampCampaignLinks({ html }, at);
    expect(out.html).toBe(html); // unchanged
  });

  it("is idempotent — already-tagged links are left alone", () => {
    const once = stampCampaignLinks({ html: '<a href="https://bigshoulders.com/quote">x</a>' }, at);
    const twice = stampCampaignLinks({ html: once.html }, at);
    expect(twice.html).toBe(once.html);
  });

  it("returns the body unchanged when the campaignId is not a UUID", () => {
    const html = '<a href="https://bigshoulders.com/quote">x</a>';
    expect(stampCampaignLinks({ html }, { campaignId: "not-a-uuid" }).html).toBe(html);
  });

  it("respects extra skipHosts", () => {
    const html = '<a href="https://reviews.example.com/leave">review</a>';
    expect(stampCampaignLinks({ html }, { ...at, skipHosts: ["reviews.example.com"] }).html).toBe(html);
  });
});
