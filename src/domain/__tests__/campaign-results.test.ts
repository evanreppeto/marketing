import { describe, expect, it } from "vitest";

import { CampaignResultsValidationError, parseCampaignResultsPayload } from "../campaign-results";

const valid = {
  campaign_id: "11111111-1111-1111-1111-111111111111",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  impressions: 1000,
  clicks: 50,
  leads: 5,
  won_revenue_cents: 200000,
  spend_cents: 50000,
};

describe("parseCampaignResultsPayload", () => {
  it("parses a single result into a one-element array with defaulted zero metrics", () => {
    const out = parseCampaignResultsPayload(valid);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      campaign_id: valid.campaign_id, period_start: "2026-05-01", period_end: "2026-05-31",
      impressions: 1000, clicks: 50, leads: 5, calls: 0, forms: 0, jobs: 0,
      won_revenue_cents: 200000, spend_cents: 50000,
    });
  });
  it("parses an array of results", () => {
    expect(parseCampaignResultsPayload([valid, { ...valid, period_start: "2026-06-01", period_end: "2026-06-30" }])).toHaveLength(2);
  });
  it("rejects a missing/invalid campaign_id", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, campaign_id: "nope" })).toThrow(CampaignResultsValidationError);
  });
  it("rejects period_end before period_start", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, period_start: "2026-06-30", period_end: "2026-06-01" })).toThrow(/period/i);
  });
  it("rejects negative metrics", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, clicks: -1 })).toThrow(CampaignResultsValidationError);
  });
  it("rejects an empty array", () => {
    expect(() => parseCampaignResultsPayload([])).toThrow(/at least one/i);
  });
  it("rejects a non-integer metric", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, clicks: 1.5 })).toThrow(CampaignResultsValidationError);
  });
  it("rejects metadata that is an array", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, metadata: [] })).toThrow(/metadata/i);
  });
  it("rejects a non-uuid campaign_asset_id but keeps a valid one", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, campaign_asset_id: "not-a-uuid" })).toThrow(/campaign_asset_id/i);
    const out = parseCampaignResultsPayload({ ...valid, campaign_asset_id: "22222222-2222-2222-2222-222222222222" });
    expect(out[0].campaign_asset_id).toBe("22222222-2222-2222-2222-222222222222");
  });
});
