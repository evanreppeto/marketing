import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { enqueueDispatchesForAssets, transitionDispatch } from "./persistence";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("enqueueDispatchesForAssets", () => {
  it("inserts one queued dispatch per asset with channel + event", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_assets: { data: [{ id: "a1", channel: "email", title: "Welcome" }], error: null },
      campaign_dispatches: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });

    await enqueueDispatchesForAssets({ campaignId: "c1", assetIds: ["a1"], operator: "Operator" }, supabase);

    const inserts = findCalls(supabase, "insert");
    expect(inserts).toContainEqual(
      expect.objectContaining({ campaign_id: "c1", campaign_asset_id: "a1", status: "queued", channel: "email" }),
    );
    expect(inserts).toContainEqual(expect.objectContaining({ event_type: "dispatch_queued" }));
  });

  it("does nothing for an empty asset list", async () => {
    const supabase = createSupabaseQueryMock({ campaign_dispatches: { data: null, error: null } });
    await enqueueDispatchesForAssets({ campaignId: "c1", assetIds: [], operator: "Operator" }, supabase);
    expect(findCalls(supabase, "insert")).toHaveLength(0);
  });
});

describe("transitionDispatch", () => {
  it("marks a dispatch sent, stamps dispatched_at, and logs an event", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: { id: "d1", campaign_id: "c1", status: "queued" }, error: null },
      campaign_events: { data: null, error: null },
    });

    await transitionDispatch({ dispatchId: "d1", to: "sent", operator: "Operator" }, supabase);

    const updates = findCalls(supabase, "update");
    expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
    expect(updates.some((u) => "dispatched_at" in u)).toBe(true);
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ event_type: "dispatch_sent" }));
  });

  it("rejects an unknown target status", async () => {
    const supabase = createSupabaseQueryMock({ campaign_dispatches: { data: { id: "d1", campaign_id: "c1", status: "queued" }, error: null } });
    await expect(
      transitionDispatch({ dispatchId: "d1", to: "bogus" as never, operator: "Operator" }, supabase),
    ).rejects.toThrow(/status/i);
  });
});
