import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { columnFor, getCampaignsForRecord } from "../read-model";

describe("columnFor", () => {
  it("maps each record kind to its campaigns FK column", () => {
    expect(columnFor("company")).toBe("company_id");
    expect(columnFor("contact")).toBe("contact_id");
    expect(columnFor("lead")).toBe("lead_id");
    expect(columnFor("property")).toBe("property_id");
  });
});

describe("getCampaignsForRecord", () => {
  it("returns campaigns referencing a record (direct + via approvals), deduped", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: {
        data: [
          {
            id: "camp-1",
            name: "Spring Flood Recovery",
            persona: "property_manager",
            restoration_focus: "water",
            status: "review",
            company_id: "co-1",
            contact_id: null,
            lead_id: null,
            owner: "Mark",
            objective: null,
            audience_summary: null,
            offer_summary: null,
            compliance_notes: null,
            launch_locked: true,
            source_signal: {},
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-02T00:00:00Z",
          },
        ],
        error: null,
      },
      approval_items: { data: [{ campaign_id: "camp-1", id: "appr-1", status: "approved", campaign_asset_id: "a1" }], error: null },
      campaign_assets: {
        data: [{ id: "a1", campaign_id: "camp-1", asset_type: "email", channel: "email", title: "Welcome", status: "pending_approval", dispatch_locked: true }],
        error: null,
      },
      agent_outputs: { data: [], error: null },
    });

    const result = await getCampaignsForRecord("company", "co-1", supabase);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "camp-1", name: "Spring Flood Recovery", href: "/campaigns/camp-1" });
    expect(["Drafting", "In review", "Ready", "Live"]).toContain(result[0].lifecycle);
    expect(typeof result[0].pendingCount).toBe("number");
  });

  it("returns [] when nothing references the record", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [], error: null },
      approval_items: { data: [], error: null },
    });
    expect(await getCampaignsForRecord("lead", "lead-x", supabase)).toEqual([]);
  });
});
