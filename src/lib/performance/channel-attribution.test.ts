import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildAssetRows, buildChannelRows, formatChannelLabel } from "./campaign-panel";
import { getCampaignAttributionRows } from "./attribution-read-model";

const CAMPAIGN = "22222222-2222-2222-2222-222222222222";

describe("formatChannelLabel", () => {
  it("keeps acronyms and known channels presentable, title-cases the rest", () => {
    expect(formatChannelLabel("sms")).toBe("SMS");
    expect(formatChannelLabel("email")).toBe("Email");
    expect(formatChannelLabel("paid_social")).toBe("Paid social");
    expect(formatChannelLabel("meta_ads")).toBe("Meta Ads");
    expect(formatChannelLabel("door_hanger")).toBe("Door hanger");
  });
});

describe("buildChannelRows", () => {
  it("attributes leads + booked revenue from CRM and merges spend from delivery results", () => {
    const rows = buildChannelRows({
      leadChannels: [
        { id: "l1", channel: "email" },
        { id: "l2", channel: "email" },
        { id: "l3", channel: "sms" },
        { id: "l4", channel: null }, // unattributed — excluded from channel rows
      ],
      outcomes: [
        { lead_id: "l1", status: "won", gross_revenue_cents: 300000 },
        { lead_id: "l2", status: "paid", gross_revenue_cents: 200000 },
        { lead_id: "l3", status: "lost", gross_revenue_cents: 0 }, // not won/paid
      ],
      results: [
        { channel: "email", campaign_asset_id: null, impressions: 0, clicks: 0, leads: 0, jobs: 0, won_revenue_cents: 0, spend_cents: 0 },
        { channel: "sms", campaign_asset_id: null, impressions: 0, clicks: 0, leads: 0, jobs: 0, won_revenue_cents: 0, spend_cents: 4000 },
      ],
      assets: [],
    });

    // Email leads on outcomes (2 booked), sorted first.
    expect(rows.map((r) => r.channel)).toEqual(["Email", "SMS"]);
    const email = rows[0];
    expect(email.leads).toBe(2);
    expect(email.booked).toBe(2);
    expect(email.revenue).toBe("$5,000");
    expect(email.spend).toBe("—"); // no spend recorded
    expect(email.share).toBe(67); // 2 of 3 attributed leads

    const sms = rows[1];
    expect(sms.leads).toBe(1);
    expect(sms.booked).toBe(0);
    expect(sms.spend).toBe("$40"); // from delivery results
  });

  it("falls back to self-reported delivery figures for a channel with no CRM attribution", () => {
    const rows = buildChannelRows({
      leadChannels: [],
      outcomes: [],
      results: [
        { channel: "paid_social", campaign_asset_id: null, impressions: 10000, clicks: 200, leads: 12, jobs: 3, won_revenue_cents: 900000, spend_cents: 150000 },
      ],
      assets: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe("Paid social");
    expect(rows[0].leads).toBe(12);
    expect(rows[0].booked).toBe(3);
    expect(rows[0].revenue).toBe("$9,000");
    expect(rows[0].spend).toBe("$1,500");
  });

  it("returns nothing when no channel carries any signal", () => {
    expect(
      buildChannelRows({ leadChannels: [{ id: "l1", channel: null }], outcomes: [], results: [], assets: [] }),
    ).toEqual([]);
  });
});

describe("buildAssetRows", () => {
  it("surfaces only delivered assets, computes CTR, sorts by it", () => {
    const rows = buildAssetRows({
      leadChannels: [],
      outcomes: [],
      results: [
        { channel: "meta_ads", campaign_asset_id: "a1", impressions: 1000, clicks: 30, leads: 4, jobs: 0, won_revenue_cents: 0, spend_cents: 0 },
        { channel: "meta_ads", campaign_asset_id: "a2", impressions: 1000, clicks: 80, leads: 9, jobs: 0, won_revenue_cents: 0, spend_cents: 0 },
      ],
      assets: [
        { id: "a1", title: "Reel A", channel: "meta_ads", asset_type: "social_ad", source_system: "operator", tool_source: null, status: "approved" },
        { id: "a2", title: "Reel B", channel: "meta_ads", asset_type: "video_prompt", source_system: null, tool_source: "higgsfield", status: "approved" },
        { id: "a3", title: "Undelivered", channel: "email", asset_type: "email", source_system: "operator", tool_source: null, status: "draft" },
      ],
    });

    // a3 has no delivery results → excluded. a2 higher CTR → first.
    expect(rows.map((r) => r.id)).toEqual(["a2", "a1"]);
    expect(rows[0].ctr).toBe(8); // 80/1000
    expect(rows[0].source).toBe("AI-generated"); // tool_source set
    expect(rows[0].format).toBe("Video");
    expect(rows[1].ctr).toBe(3); // 30/1000
    expect(rows[1].source).toBe("Real media"); // operator-authored, no tool
  });
});

describe("getCampaignAttributionRows", () => {
  it("returns live rows across leads, outcomes, results, and assets", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [{ id: "l1", attribution_channel: "email" }], error: null },
      outcomes: { data: [{ lead_id: "l1", status: "won", gross_revenue_cents: 250000 }], error: null },
      campaign_results: { data: [{ channel: "email", campaign_asset_id: null, impressions: 0, clicks: 0, leads: 0, jobs: 0, won_revenue_cents: 0, spend_cents: 5000 }], error: null },
      campaign_assets: { data: [{ id: "a1", title: "Email 1", channel: "email", asset_type: "email", source_system: "operator", tool_source: null, status: "approved" }], error: null },
    });

    const out = await getCampaignAttributionRows(CAMPAIGN, supabase);
    expect(out.status).toBe("live");
    if (out.status === "live") {
      expect(out.leadChannels).toEqual([{ id: "l1", channel: "email" }]);
      expect(out.outcomes).toHaveLength(1);
      expect(out.results[0].spend_cents).toBe(5000);
      expect(out.assets[0].id).toBe("a1");
    }
  });

  it("reports unavailable when a query errors", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: { message: "boom" } } });
    const out = await getCampaignAttributionRows(CAMPAIGN, supabase);
    expect(out.status).toBe("unavailable");
  });
});
