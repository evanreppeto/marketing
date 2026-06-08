import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { persistCompetitorIntel } from "./persistence";

function insertsByTable(supabase: MockSupabase, table: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let current: string | null = null;
  for (const [method, arg] of supabase.calls) {
    if (method === "from") current = arg as string;
    else if (method === "insert" && current === table) out.push(arg as Record<string, unknown>);
  }
  return out;
}

const valid = {
  source: "meta_ad_library",
  competitorName: "ServiceMaster Chicago",
  summary: "4 storm-response ads",
  adCreatives: [{ headline: "Flooded?" }],
  operator: "Mark",
};

describe("persistCompetitorIntel", () => {
  it("inserts a needs_review competitor_campaigns row", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      competitor_campaigns: { data: { id: "ci-1" }, error: null },
    });

    const result = await persistCompetitorIntel(valid, supabase);
    expect(result.status).toBe("needs_review");
    expect(result.competitorCampaignId).toBe("ci-1");

    const rows = insertsByTable(supabase, "competitor_campaigns");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("meta_ad_library");
    expect(rows[0].competitor_name).toBe("ServiceMaster Chicago");
    expect(rows[0].status).toBe("needs_review");
  });

  it("rejects an invalid payload before any insert", async () => {
    const supabase = createSupabaseQueryMock({});
    await expect(persistCompetitorIntel({ source: "tiktok", competitorName: "x" }, supabase)).rejects.toThrow();
  });
});
