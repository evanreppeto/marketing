import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getPerformanceReadModel } from "./read-model";

describe("getPerformanceReadModel", () => {
  it("returns live measurement signals with explicit missing KPI contracts", async () => {
    const supabase = createSupabaseQueryMock({
      leads: {
        data: [
          {
            id: "lead-1",
            persona: "persona_property_manager",
            source: "arc_partner_campaign",
            status: "qualified",
            lead_score: 84,
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
      jobs: {
        data: [
          {
            id: "job-1",
            lead_id: "lead-1",
            persona: "persona_property_manager",
            status: "estimate_sent",
            estimated_revenue_cents: 1250000,
            created_at: "2026-06-02T12:30:00.000Z",
            updated_at: "2026-06-02T12:30:00.000Z",
          },
        ],
        error: null,
      },
      outcomes: {
        data: [
          {
            id: "outcome-1",
            lead_id: "lead-1",
            company_id: "company-1",
            persona: "persona_property_manager",
            status: "won",
            gross_revenue_cents: 1250000,
            gross_margin_cents: 420000,
            closed_at: "2026-06-03T12:00:00.000Z",
            created_at: "2026-06-03T12:00:00.000Z",
          },
        ],
        error: null,
      },
      campaigns: {
        data: [
          {
            id: "campaign-1",
            name: "Spring flood recovery",
            persona: "persona_property_manager",
            status: "draft",
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
      campaign_assets: {
        data: [
          {
            id: "asset-1",
            campaign_id: "campaign-1",
            asset_type: "email",
            channel: "email",
            status: "pending_owner_approval",
          },
        ],
        error: null,
      },
      approval_items: {
        data: [
          {
            id: "approval-1",
            campaign_id: "campaign-1",
            item_type: "email_campaign_asset",
            status: "pending_owner_approval",
            risk_level: "medium",
          },
        ],
        error: null,
      },
      companies: {
        data: [
          {
            id: "company-1",
            persona: "persona_plumbing_partner",
            status: "active",
            partner_tier: "A",
            metadata: {},
          },
        ],
        error: null,
      },
      engagement_events: { data: [], error: { message: "table missing" } },
    });

    const model = await getPerformanceReadModel(supabase);

    expect(model.status).toBe("live");
    if (model.status !== "live") return;

    expect(model.conversionSignals).toContainEqual(
      expect.objectContaining({
        label: "Estimate close rate proxy",
        detail: expect.stringContaining("until estimate status timestamps exist"),
      }),
    );
    expect(model.campaignSignals).toContainEqual(
      expect.objectContaining({
        label: "Cost per booked job",
        value: "Missing",
        tone: "amber",
      }),
    );
    expect(model.partnerSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Partner referrals", value: "Missing" }),
        expect.objectContaining({ label: "Referral conversion", value: "Missing" }),
      ]),
    );
    expect(model.ctaSignals).toContainEqual(
      expect.objectContaining({
        label: "CTA/form/photo-upload conversion",
        value: "Missing",
      }),
    );
    expect(model.contracts).toContainEqual(
      expect.objectContaining({
        area: "Campaign performance",
        missingFields: expect.stringContaining("cost_per_booked_job_cents"),
      }),
    );
  });

  it("scopes every service-role query to the caller's org (no cross-tenant leak)", async () => {
    const supabase = createSupabaseQueryMock({});
    await getPerformanceReadModel(supabase, 30, "org-abc");
    const calls = (supabase as unknown as { calls: Array<[string, ...unknown[]]> }).calls;
    const orgScopedCalls = calls.filter(
      (call) => call[0] === "eq" && call[1] === "org_id" && call[2] === "org-abc",
    );
    // One org_id filter per underlying table read: leads, jobs, outcomes, campaigns,
    // campaign_assets, approval_items, companies, engagement_events. The read model uses the
    // RLS-bypassing service-role client, so missing scoping here = cross-tenant leak.
    expect(orgScopedCalls).toHaveLength(8);
  });
});
