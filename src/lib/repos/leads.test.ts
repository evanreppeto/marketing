import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listLeads } from "./leads";

const validLeadRow = {
  id: "10000000-0000-4000-8000-000000000001",
  company_id: null,
  contact_id: "10000000-0000-4000-8000-000000000003",
  property_id: null,
  persona: "persona_homeowner_emergency",
  status: "validated",
  routing_recommendation: "elevated",
  source: "website",
  external_lead_id: null,
  loss_summary: "Basement flooding",
  loss_signals: ["standing water"],
  matched_target_keywords: ["standing water"],
  matched_non_target_keywords: [],
  lead_score: 85,
  received_at: "2026-05-28T09:00:00.000Z",
  metadata: {},
  created_at: "2026-05-28T09:00:00.000Z",
  updated_at: "2026-05-28T09:00:00.000Z",
};

describe("listLeads", () => {
  it("returns parsed Lead objects ordered by received_at desc", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [validLeadRow], error: null },
    });

    const leads = await listLeads({}, supabase);

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      id: validLeadRow.id,
      leadScore: 85,
      receivedAt: "2026-05-28T09:00:00.000Z",
    });
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["select", "*"]);
    expect(supabase.calls).toContainEqual(["order", "received_at", { ascending: false }]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(listLeads({}, supabase)).rejects.toThrow(/listLeads failed: db down/);
  });

  it("returns an empty array when Supabase returns null data with no error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: null },
    });

    await expect(listLeads({}, supabase)).resolves.toEqual([]);
  });
});
