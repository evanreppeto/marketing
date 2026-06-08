import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getCampaignEconomics } from "./attribution-read-model";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";

describe("getCampaignEconomics", () => {
  it("rolls won outcome revenue up to the campaign and computes ROAS from real spend", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [{ id: "lead-1" }, { id: "lead-2" }], error: null },
      jobs: { data: [{ lead_id: "lead-1", status: "in_progress", estimated_revenue_cents: 90000 }], error: null },
      outcomes: { data: [{ lead_id: "lead-2", status: "won", gross_revenue_cents: 400000 }], error: null },
      campaign_results: { data: [{ spend_cents: 100000 }], error: null },
    });

    const out = await getCampaignEconomics(CAMPAIGN, supabase);
    expect(out.status).toBe("live");
    if (out.status === "live") {
      expect(out.attributedLeads).toBe(2);
      expect(out.wonCount).toBe(1);
      expect(out.realizedRevenueCents).toBe(400000);
      expect(out.pipelineRevenueCents).toBe(90000);
      expect(out.spendCents).toBe(100000);
      expect(out.roas).toBeCloseTo(4);
      expect(out.selfReported.wonRevenueCents).toBe(0);
    }
  });

  it("reports unavailable when a query errors", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: { message: "boom" } } });
    const out = await getCampaignEconomics(CAMPAIGN, supabase);
    expect(out.status).toBe("unavailable");
  });
});
