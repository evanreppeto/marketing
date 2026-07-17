import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getPerformanceReadModel } from "./read-model";

/**
 * "Won revenue" must count won outcomes.
 *
 * It didn't: both revenue sums read every outcome row regardless of status, while
 * the tile beside them captioned itself "${wonOutcomes.length} won/paid outcomes"
 * — the number and its own label built from different sets, with the correct
 * filter sitting one line above, unused.
 *
 * Prod couldn't show it. Revenue is only ever booked on won/paid rows there, so
 * the two agree by luck. This fixture books revenue on a LOST deal — ordinary CRM
 * practice, and exactly the kind of number you want to keep — which is the moment
 * the headline silently inflates.
 */

const RECENT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const outcome = (id: string, status: string, cents: number) => ({
  id,
  lead_id: "lead-1",
  company_id: "company-1",
  persona: "persona_property_manager",
  status,
  gross_revenue_cents: cents,
  gross_margin_cents: Math.round(cents * 0.35),
  closed_at: RECENT,
  created_at: RECENT,
});

const modelWith = (outcomes: ReturnType<typeof outcome>[]) =>
  getPerformanceReadModel(
    createSupabaseQueryMock({
      leads: {
        data: [
          {
            id: "lead-1",
            persona: "persona_property_manager",
            source: "web",
            status: "qualified",
            lead_score: 80,
            created_at: RECENT,
            updated_at: RECENT,
          },
        ],
        error: null,
      },
      jobs: { data: [], error: null },
      outcomes: { data: outcomes, error: null },
      campaigns: { data: [], error: null },
      campaign_assets: { data: [], error: null },
      approval_items: { data: [], error: null },
      companies: { data: [], error: null },
      engagement_events: { data: [], error: null },
    }),
  );

describe("won revenue counts won outcomes only", () => {
  it("excludes revenue booked on a lost deal", async () => {
    const model = await modelWith([
      outcome("won-1", "won", 1_000_000), // $10,000
      outcome("lost-1", "lost", 5_000_000), // $50,000 of deal we did NOT win
    ]);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;

    // $10,000, not $60,000.
    expect(model.revenueRecent.cents).toBe(1_000_000);
  });

  it("keeps the tile's number and its own caption in step", async () => {
    // The tile reads "<value> — N won/paid outcomes". Those must describe the same
    // rows; previously the caption counted won/paid and the value counted everything.
    const model = await modelWith([
      outcome("won-1", "won", 1_000_000),
      outcome("paid-1", "paid", 500_000),
      outcome("lost-1", "lost", 9_000_000),
    ]);
    if (model.status !== "live") return;

    const tile = model.metrics.find((s) => s.label === "Revenue linked");
    expect(tile?.detail).toBe("2 won/paid outcomes");
    // $15,000 across those 2 — the lost $90,000 is not revenue.
    expect(tile?.value).toContain("15,000");
  });

  it("counts paid and closed_won as won", async () => {
    const model = await modelWith([
      outcome("won-1", "won", 100_000),
      outcome("paid-1", "paid", 100_000),
      outcome("cw-1", "closed_won", 100_000),
    ]);
    if (model.status !== "live") return;
    expect(model.revenueRecent.cents).toBe(300_000);
  });

  it("reports no revenue when nothing has been won", async () => {
    const model = await modelWith([outcome("lost-1", "lost", 5_000_000)]);
    if (model.status !== "live") return;
    // Not $50,000 — and the tile must not claim won/paid outcomes it doesn't have.
    expect(model.revenueRecent.cents).toBe(0);
    expect(model.metrics.find((s) => s.label === "Revenue linked")?.detail).toBe("0 won/paid outcomes");
  });
});
