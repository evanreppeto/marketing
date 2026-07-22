import { describe, expect, it } from "vitest";

import {
  countRevisions,
  groupByAssetId,
  resolveShippedBody,
  shapeCandidates,
  summarizeEngagement,
  summarizeOutcome,
  wasApprovedUnchanged,
  type CampaignAssetRow,
  type CampaignEventRow,
} from "./shape";

function asset(overrides: Partial<CampaignAssetRow> & { id: string }): CampaignAssetRow {
  return {
    campaign_id: "cmp-1",
    asset_type: "email",
    channel: "email",
    title: "Flood response",
    status: "approved",
    draft_body: "draft copy",
    edited_body: null,
    approved_body: "approved copy",
    approved_at: "2026-07-01T00:00:00.000Z",
    edited_fields: {},
    ...overrides,
  };
}

function decisionEvent(decision: string, assetId = "a1"): CampaignEventRow {
  return { campaign_asset_id: assetId, event_type: "approval_decided", payload: { decision } };
}

describe("resolveShippedBody", () => {
  it("prefers approved, then edited, then draft", () => {
    expect(resolveShippedBody(asset({ id: "a" }))).toBe("approved copy");
    expect(resolveShippedBody(asset({ id: "a", approved_body: null, edited_body: "edited copy" }))).toBe("edited copy");
    expect(resolveShippedBody(asset({ id: "a", approved_body: null, edited_body: null }))).toBe("draft copy");
  });

  it("treats whitespace-only bodies as absent", () => {
    expect(resolveShippedBody(asset({ id: "a", approved_body: "   \n ", edited_body: "real copy" }))).toBe("real copy");
    expect(resolveShippedBody(asset({ id: "a", approved_body: null, edited_body: null, draft_body: "  " }))).toBeNull();
  });
});

describe("wasApprovedUnchanged", () => {
  it("is true only for an approved asset with no edits recorded", () => {
    expect(wasApprovedUnchanged(asset({ id: "a" }))).toBe(true);
  });

  it("is false when the status is not approved", () => {
    expect(wasApprovedUnchanged(asset({ id: "a", status: "pending_approval" }))).toBe(false);
    expect(wasApprovedUnchanged(asset({ id: "a", status: "declined" }))).toBe(false);
  });

  it("is false when the body was rewritten", () => {
    expect(wasApprovedUnchanged(asset({ id: "a", edited_body: "operator rewrote this" }))).toBe(false);
  });

  it("is false when a non-body field was edited", () => {
    // An operator can fix the subject line without touching the body — that is
    // still not an untouched approval, and counting it as one would overstate
    // the strongest signal the approval tier has.
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: { subject: true } }))).toBe(false);
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: ["cta"] }))).toBe(false);
  });

  it("tolerates empty or malformed edited_fields", () => {
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: {} }))).toBe(true);
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: [] }))).toBe(true);
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: null }))).toBe(true);
    expect(wasApprovedUnchanged(asset({ id: "a", edited_fields: "unexpected" }))).toBe(true);
  });
});

describe("countRevisions", () => {
  it("counts only revision_requested decisions", () => {
    expect(
      countRevisions([decisionEvent("revision_requested"), decisionEvent("approved"), decisionEvent("revision_requested")]),
    ).toBe(2);
  });

  it("ignores non-decision events and malformed payloads", () => {
    expect(
      countRevisions([
        { campaign_asset_id: "a1", event_type: "asset_edited", payload: { decision: "revision_requested" } },
        { campaign_asset_id: "a1", event_type: "approval_decided", payload: null },
        { campaign_asset_id: "a1", event_type: "approval_decided", payload: "revision_requested" },
        { campaign_asset_id: "a1", event_type: "approval_decided", payload: {} },
      ]),
    ).toBe(0);
  });
});

describe("summarizeOutcome", () => {
  it("sums every result period for the asset", () => {
    const total = summarizeOutcome([
      { campaign_asset_id: "a", impressions: 100, clicks: 10, leads: 3, jobs: 1, won_revenue_cents: 50_000, spend_cents: 1_000 },
      { campaign_asset_id: "a", impressions: 200, clicks: 20, leads: 4, jobs: 2, won_revenue_cents: 70_000, spend_cents: 2_000 },
    ]);
    expect(total).toEqual({ impressions: 300, clicks: 30, leads: 7, jobs: 3, wonRevenueCents: 120_000, spendCents: 3_000 });
  });

  it("treats null counters as zero and no rows as no evidence", () => {
    expect(summarizeOutcome([])).toBeNull();
    expect(
      summarizeOutcome([
        { campaign_asset_id: "a", impressions: null, clicks: null, leads: null, jobs: null, won_revenue_cents: null, spend_cents: null },
      ]),
    ).toEqual({ impressions: 0, clicks: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0 });
  });
});

describe("summarizeEngagement", () => {
  it("counts sends, opens, and clicks from touch rows", () => {
    const totals = summarizeEngagement([
      { campaign_asset_id: "a", event_type: "email_sent" },
      { campaign_asset_id: "a", event_type: "email_sent" },
      { campaign_asset_id: "a", event_type: "email_open" },
      { campaign_asset_id: "a", event_type: "email_click" },
    ]);
    expect(totals).toEqual({ sends: 2, opens: 1, clicks: 1 });
  });

  it("tolerates provider variants so the denominator is not undercounted", () => {
    const totals = summarizeEngagement([
      { campaign_asset_id: "a", event_type: "EMAIL_SENT" },
      { campaign_asset_id: "a", event_type: "sms_sent" },
      { campaign_asset_id: "a", event_type: "email_opened" },
      { campaign_asset_id: "a", event_type: "clicked" },
    ]);
    expect(totals).toEqual({ sends: 2, opens: 1, clicks: 1 });
  });

  it("never counts one row twice", () => {
    // "email_click" must not also land in opens via a looser match.
    const totals = summarizeEngagement([{ campaign_asset_id: "a", event_type: "email_click" }]);
    expect(totals).toEqual({ sends: 0, opens: 0, clicks: 1 });
  });

  it("returns null when there are no touches at all", () => {
    expect(summarizeEngagement([])).toBeNull();
  });
});

describe("groupByAssetId", () => {
  it("groups rows and drops those with no asset id", () => {
    const grouped = groupByAssetId([
      { campaign_asset_id: "a", n: 1 },
      { campaign_asset_id: "b", n: 2 },
      { campaign_asset_id: "a", n: 3 },
      { campaign_asset_id: null, n: 4 },
    ]);
    expect(grouped.get("a")).toHaveLength(2);
    expect(grouped.get("b")).toHaveLength(1);
    expect(grouped.size).toBe(2);
  });
});

describe("shapeCandidates", () => {
  const base = {
    personaByCampaignId: new Map([["cmp-1", "persona_landlord"]]),
    eventsByAssetId: new Map<string, CampaignEventRow[]>(),
    resultsByAssetId: new Map(),
    engagementByAssetId: new Map(),
  };

  it("shapes an asset with its persona, approval state, and metrics", () => {
    const [candidate] = shapeCandidates({
      ...base,
      assets: [asset({ id: "a1" })],
      eventsByAssetId: new Map([["a1", [decisionEvent("revision_requested")]]]),
      resultsByAssetId: new Map([
        ["a1", [{ campaign_asset_id: "a1", impressions: 10, clicks: 2, leads: 1, jobs: 1, won_revenue_cents: 500, spend_cents: 100 }]],
      ]),
    });
    expect(candidate).toMatchObject({
      assetId: "a1",
      assetType: "email",
      persona: "persona_landlord",
      body: "approved copy",
      approval: { approved: true, approvedUnchanged: true, revisionCount: 1, declined: false },
    });
    expect(candidate!.outcome?.jobs).toBe(1);
  });

  it("drops assets with no copy", () => {
    const out = shapeCandidates({
      ...base,
      assets: [asset({ id: "a1", approved_body: null, edited_body: null, draft_body: null })],
    });
    expect(out).toHaveLength(0);
  });

  it("normalizes a loose asset type rather than dropping the asset", () => {
    const [candidate] = shapeCandidates({ ...base, assets: [asset({ id: "a1", asset_type: "paid_social" })] });
    expect(candidate!.assetType).toBe("social_ad");
  });

  it("drops assets whose type cannot be resolved to the enum", () => {
    const out = shapeCandidates({ ...base, assets: [asset({ id: "a1", asset_type: "carrier_pigeon" })] });
    expect(out).toHaveLength(0);
  });

  it("falls back to a placeholder title rather than an empty heading", () => {
    const [candidate] = shapeCandidates({ ...base, assets: [asset({ id: "a1", title: "  " })] });
    expect(candidate!.title).toBe("Untitled asset");
  });

  it("leaves persona null when the campaign is missing", () => {
    const [candidate] = shapeCandidates({
      ...base,
      personaByCampaignId: new Map(),
      assets: [asset({ id: "a1" })],
    });
    expect(candidate!.persona).toBeNull();
  });
});
