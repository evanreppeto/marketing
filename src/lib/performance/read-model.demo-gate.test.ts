/**
 * Demo-gate tests for performance read-model.
 * Verifies the isDemoDataEnabled() flag controls demo fallbacks:
 *   - flag OFF + empty live data → real empty live result (isDemo absent/false)
 *   - flag ON  + empty live data → demo bundle (isDemo: true, regression)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getPerformanceReadModel } from "./read-model";

afterEach(() => vi.unstubAllEnvs());

function emptyClient() {
  return createSupabaseQueryMock({
    leads: { data: [], error: null },
    jobs: { data: [], error: null },
    outcomes: { data: [], error: null },
    campaigns: { data: [], error: null },
    campaign_assets: { data: [], error: null },
    approval_items: { data: [], error: null },
    companies: { data: [], error: null },
    engagement_events: { data: [], error: null },
  });
}

describe("getPerformanceReadModel demo gate", () => {
  it("flag OFF + empty live read → real empty live result (isDemo falsy)", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "0");
    const result = await getPerformanceReadModel(emptyClient());

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.isDemo).toBeFalsy();
    // Real empty result has 0 lead records and 0 job records
    const leadMetric = result.metrics.find((m) => m.label === "Lead records");
    expect(leadMetric?.value).toBe(0);
  });

  it("flag ON + empty live read → demo bundle (isDemo: true, regression)", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const result = await getPerformanceReadModel(emptyClient());

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.isDemo).toBe(true);
    // Demo bundle has non-zero lead volume
    const leadMetric = result.metrics.find((m) => m.label === "Lead records");
    expect(Number(leadMetric?.value)).toBeGreaterThan(0);
  });
});
