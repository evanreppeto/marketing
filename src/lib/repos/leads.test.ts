import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { countLeads, getLead, listLeads } from "./leads";

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

describe("listLeads filters", () => {
  it("applies a status filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ status: "validated" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "validated"]);
  });

  it("applies a persona filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ persona: "persona_insurance_agent" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "persona", "persona_insurance_agent"]);
  });

  it("applies a source filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ source: "website" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "source", "website"]);
  });

  it("applies a numeric limit via .limit", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ limit: 25 }, supabase);

    expect(supabase.calls).toContainEqual(["limit", 25]);
  });
});

describe("getLead", () => {
  it("returns a single parsed Lead when one is found", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: validLeadRow, error: null },
    });

    const lead = await getLead(validLeadRow.id, supabase);

    expect(lead).toMatchObject({ id: validLeadRow.id, leadScore: 85 });
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["eq", "id", validLeadRow.id]);
    expect(supabase.calls).toContainEqual(["maybeSingle"]);
  });

  it("returns null when no row is found", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: null },
    });

    await expect(getLead("missing-id", supabase)).resolves.toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(getLead("any-id", supabase)).rejects.toThrow(/getLead failed: db down/);
  });
});

describe("countLeads", () => {
  it("returns the count value from a head select", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 42 } as unknown as Parameters<typeof createSupabaseQueryMock>[0]["leads"],
    });

    const count = await countLeads({}, supabase);

    expect(count).toBe(42);
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: true }]);
  });

  it("applies a status filter", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 7 } as unknown as Parameters<typeof createSupabaseQueryMock>[0]["leads"],
    });

    await countLeads({ status: "validated" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "validated"]);
  });

  it("returns 0 when count is null or missing", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await expect(countLeads({}, supabase)).resolves.toBe(0);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "boom" } },
    });

    await expect(countLeads({}, supabase)).rejects.toThrow(/countLeads failed: boom/);
  });
});
