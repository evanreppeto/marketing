import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getDashboardCounts } from "./read-model";

describe("getDashboardCounts", () => {
  it("returns live dashboard counts from Supabase head selects", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: [], error: null, count: 3 },
      leads: { data: [], error: null, count: 7 },
      campaigns: { data: [], error: null, count: 2 },
      agent_tasks: { data: [], error: null, count: 5 },
    });

    const counts = await getDashboardCounts(supabase);

    expect(counts).toMatchObject({
      status: "live",
      approvalsWaiting: 3,
      leadsFound: 7,
      leadsAwaitingReview: 7,
      campaignsDrafted: 2,
      agentTasksOpen: 5,
      agentTasksCompleted: 5,
    });
    expect(supabase.calls).toContainEqual(["from", "approval_items"]);
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: true }]);
    expect(supabase.calls).toContainEqual([
      "in",
      "status",
      ["needs_compliance", "pending_approval", "pending_owner_approval", "revision_requested"],
    ]);
    expect(supabase.calls).toContainEqual(["in", "status", ["completed"]]);
  });

  it("returns unavailable when a count fails", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: null, error: { message: "db down" } },
    });

    await expect(getDashboardCounts(supabase)).resolves.toMatchObject({
      status: "unavailable",
      message: "approval_items count failed: db down",
    });
  });
});
