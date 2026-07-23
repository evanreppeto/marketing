import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildExternalSendPackage, recordExternalSend } from "./external-send";

const CAMPAIGN_ID = "10000000-0000-4000-8000-000000000021";
const ASSET_ID = "20000000-0000-4000-8000-000000000042";
const TENANT = { org_id: "org-1", workspace_id: "ws-1" } as never;

function approvedAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    campaign_id: CAMPAIGN_ID,
    org_id: "org-1",
    channel: "email",
    title: "Spring gutter check",
    status: "approved",
    approved_at: "2026-07-23T12:00:00.000Z",
    approved_body: "Book your inspection: https://bigshoulders.example/book\n\nSee you soon.",
    edited_body: null,
    draft_body: null,
    ...overrides,
  };
}

const CONTACTS = [
  { id: "ct-1", persona: "persona_property_manager", status: "active", email: "pm@example.com", phone: null, full_name: "Pat Manager", company_id: null },
  { id: "ct-2", persona: "persona_property_manager", status: "do_not_contact", email: "no@example.com", phone: null, full_name: "Opted Out", company_id: null },
];

function clientFor(asset: Record<string, unknown> | null) {
  return createSupabaseQueryMock({
    campaign_assets: { data: asset, error: null },
    campaigns: { data: { persona: "persona_property_manager", contact_id: null, company_id: null }, error: null },
    contacts: { data: CONTACTS, error: null },
    engagement_events: { data: null, error: null },
    campaign_events: { data: null, error: null },
  });
}

describe("buildExternalSendPackage", () => {
  it("exports the approved body with campaign attribution stamped into links", async () => {
    const result = await buildExternalSendPackage({ campaignId: CAMPAIGN_ID, assetId: ASSET_ID, tenant: TENANT }, clientFor(approvedAsset()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.subject).toBe("Spring gutter check");
    // The same stamping the native send applies: utm + the bsg_at token
    // resolveAttribution reads back on click-through.
    expect(result.pkg.text).toContain("bsg_at=");
    expect(result.pkg.html).toContain("utm_campaign");
    // Audience: active contact in, do_not_contact suppressed.
    expect(result.pkg.recipients).toHaveLength(1);
    expect(result.pkg.suppressedCount).toBe(1);
    expect(result.pkg.audienceCsv.split("\n")).toEqual(["email,name,persona", "pm@example.com,Pat Manager,persona_property_manager"]);
  });

  it("refuses a deliverable without a human approval signature", async () => {
    const result = await buildExternalSendPackage(
      { campaignId: CAMPAIGN_ID, assetId: ASSET_ID, tenant: TENANT },
      clientFor(approvedAsset({ approved_at: null })),
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("approved") });
  });

  it("refuses when the asset isn't in this workspace", async () => {
    const result = await buildExternalSendPackage({ campaignId: CAMPAIGN_ID, assetId: ASSET_ID, tenant: TENANT }, clientFor(null));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("workspace") });
  });
});

describe("recordExternalSend", () => {
  it("writes one idempotent outbound touch per recipient and a campaign event", async () => {
    const client = clientFor(approvedAsset());
    const result = await recordExternalSend(
      { campaignId: CAMPAIGN_ID, assetId: ASSET_ID, operator: "Evan", tool: "Mailchimp", tenant: TENANT },
      client,
    );
    expect(result).toEqual({ ok: true, recipients: 1 });

    const upsert = client.calls.find(([method]) => method === "upsert");
    const rows = upsert?.[1] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: "outbound_send",
      direction: "outbound",
      source_system: "external",
      external_event_id: `ext-send:${ASSET_ID}:ct-1`,
      contact_id: "ct-1",
      campaign_id: CAMPAIGN_ID,
      campaign_asset_id: ASSET_ID,
    });
    expect(upsert?.[2]).toMatchObject({ onConflict: "source_system,external_event_id", ignoreDuplicates: true });

    const insert = client.calls.find(([method]) => method === "insert");
    expect(insert?.[1]).toMatchObject({ event_type: "exported", actor: "Evan" });
    expect((insert?.[1] as { detail: string }).detail).toContain("Mailchimp");
  });

  it("refuses an unapproved deliverable — the human gate applies to external sends too", async () => {
    const client = clientFor(approvedAsset({ approved_at: null }));
    const result = await recordExternalSend(
      { campaignId: CAMPAIGN_ID, assetId: ASSET_ID, operator: "Evan", tenant: TENANT },
      client,
    );
    expect(result.ok).toBe(false);
    expect(client.calls.some(([method]) => method === "upsert")).toBe(false);
  });
});
