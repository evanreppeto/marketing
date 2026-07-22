import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => {
    throw new Error("tests must pass an explicit client");
  },
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: async () => "org-1" }));

import { runCompetitorSignalDetection, runWeatherEventDetection, type WeatherEventSource } from "../detector";

const NOW = "2026-06-17T00:00:00.000Z";

function insertedRows(mock: MockSupabase): Array<Record<string, unknown>> {
  const call = mock.calls.find((c) => c[0] === "insert");
  return (call?.[1] as Array<Record<string, unknown>>) ?? [];
}

afterEach(() => vi.clearAllMocks());

describe("runWeatherEventDetection", () => {
  it("persists org-scoped weather opportunities from the injected alert source", async () => {
    const source: WeatherEventSource = {
      listActiveEvents: async () => [
        {
          id: "wx-1",
          eventType: "Flash Flood Warning",
          area: "Riverside",
          severity: "warning",
          endsAt: "2026-06-18T00:00:00.000Z",
          sourceUrls: ["https://www.weather.gov/lot/"],
        },
      ],
    };
    const mock = createSupabaseQueryMock({ opportunities: { data: [], error: null } });

    const res = await runWeatherEventDetection(source, mock, NOW);

    expect(res).toEqual({ ok: true, count: 1 });
    const rows = insertedRows(mock);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "weather_event", subject_id: "wx-1", org_id: "org-1" });
  });

  it("no-ops (nothing inserted) when the source reports no active alerts", async () => {
    const source: WeatherEventSource = { listActiveEvents: async () => [] };
    const mock = createSupabaseQueryMock({ opportunities: { data: [], error: null } });

    const res = await runWeatherEventDetection(source, mock, NOW);

    expect(res).toEqual({ ok: true, count: 0 });
    expect(insertedRows(mock)).toHaveLength(0);
  });
});

describe("runCompetitorSignalDetection", () => {
  it("reads competitor_campaigns (org-scoped, non-archived) and persists defensive-flight opportunities", async () => {
    const mock = createSupabaseQueryMock({
      competitor_campaigns: {
        data: [
          {
            id: "cc-1",
            competitor_name: "ServPro",
            source: "meta_ad_library",
            status: "confirmed",
            top_keywords: ["water damage oak park"],
            ad_creatives: [{}, {}, {}, {}, {}, {}],
            persona: "persona_homeowner_emergency",
            captured_at: "2026-06-15T00:00:00.000Z",
            competitor_url: "https://www.facebook.com/ads/library/",
          },
        ],
        error: null,
      },
      opportunities: { data: [], error: null },
    });

    const res = await runCompetitorSignalDetection(mock, NOW);

    expect(res).toEqual({ ok: true, count: 1 });
    // Org-scoped + drops archived intel at the query.
    expect(mock.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(mock.calls).toContainEqual(["neq", "status", "archived"]);
    const rows = insertedRows(mock);
    expect(rows[0]).toMatchObject({ kind: "competitor_signal", subject_id: "cc-1", org_id: "org-1" });
  });

  it("dedups against an already-open competitor opportunity for the same subject", async () => {
    const mock = createSupabaseQueryMock({
      competitor_campaigns: {
        data: [
          {
            id: "cc-1",
            competitor_name: "ServPro",
            source: "meta_ad_library",
            status: "confirmed",
            top_keywords: [],
            ad_creatives: [{}, {}],
            captured_at: "2026-06-15T00:00:00.000Z",
          },
        ],
        error: null,
      },
      opportunities: { data: [{ subject_id: "cc-1", status: "pending" }], error: null },
    });

    const res = await runCompetitorSignalDetection(mock, NOW);

    expect(res).toEqual({ ok: true, count: 0 });
    expect(insertedRows(mock)).toHaveLength(0);
  });

  it("surfaces a read error instead of throwing", async () => {
    const mock = createSupabaseQueryMock({
      competitor_campaigns: { data: null, error: { message: "boom" } },
    });

    const res = await runCompetitorSignalDetection(mock, NOW);

    expect(res).toEqual({ ok: false, error: "boom" });
  });
});
