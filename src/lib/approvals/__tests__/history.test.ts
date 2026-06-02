import { describe, expect, it } from "vitest";

import { listApprovalHistory } from "../read-model";

/**
 * Fake Supabase client returning canned rows per table. Builder methods return
 * `this`; the builder is awaitable (`then`) resolving to `{ data, error }`, which
 * is how the read-model consumes list queries.
 */
function makeClient(tables: Record<string, unknown[]>) {
  function builder(table: string) {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      order: () => api,
      limit: () => api,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: tables[table] ?? [], error: null }),
    };
    return api;
  }
  return { from: (table: string) => builder(table) } as never;
}

describe("listApprovalHistory", () => {
  it("maps decisions newest-first with item + campaign context", async () => {
    const client = makeClient({
      approval_decisions: [
        { id: "d1", approval_item_id: "i1", decision: "approved", decided_by: "Evan", decided_at: "2026-05-28T15:04:00Z", decision_notes: "ok", previous_status: "pending_approval", next_status: "approved" },
      ],
      approval_items: [{ id: "i1", item_type: "email_campaign_asset", risk_level: "medium", campaign_id: "c1" }],
      campaigns: [{ id: "c1", name: "Spring Flood Recovery" }],
    });

    const rows = await listApprovalHistory({ limit: 10 }, client);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decision: "approved",
      decidedBy: "Evan",
      itemType: "email_campaign_asset",
      riskLevel: "medium",
      campaignId: "c1",
      campaignName: "Spring Flood Recovery",
    });
  });

  it("returns an empty array when there are no decisions", async () => {
    const client = makeClient({ approval_decisions: [], approval_items: [], campaigns: [] });
    const rows = await listApprovalHistory({}, client);
    expect(rows).toEqual([]);
  });
});
