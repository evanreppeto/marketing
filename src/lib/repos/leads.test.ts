import { describe, expect, it } from "vitest";

import { LEAD_SUMMARY_COLUMNS } from "@/domain";

import { createSupabaseQueryMock, type MockResponse } from "./__tests__/test-helpers";
import { countLeads, getLead, listLeads, listLeadsPage, listLeadSummariesPage } from "./leads";

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
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: false }]);
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

  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
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

  it("applies a lead_score range via gte/lte", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: [], error: null } });

    await listLeads({ minScore: 80, maxScore: 95 }, supabase);

    expect(supabase.calls).toContainEqual(["gte", "lead_score", 80]);
    expect(supabase.calls).toContainEqual(["lte", "lead_score", 95]);
  });

  it("applies a free-text search via ilike on loss_summary", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: [], error: null } });

    await listLeads({ q: "flood" }, supabase);

    expect(supabase.calls).toContainEqual(["ilike", "loss_summary", "%flood%"]);
  });

  it("can exclude synthetic seed fixtures before counting or returning rows", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: [], error: null } });

    await listLeadSummariesPage({ excludeSynthetic: true }, supabase);

    expect(supabase.calls).toContainEqual(["is", "metadata->>seed_batch", null]);
  });
});

describe("listLeadsPage", () => {
  it("returns the page's rows plus the exact total behind them", async () => {
    // The shape the whole fix rests on: `total` is the count of ALL matching
    // leads, not the length of the page. Reading 200 rows to discover "200" is
    // what overflowed Arc's tool budget and left it guessing.
    const supabase = createSupabaseQueryMock({
      leads: { data: [validLeadRow], error: null, count: 200 } satisfies MockResponse,
    });

    const page = await listLeadsPage({ limit: 1 }, supabase);

    expect(page.leads).toHaveLength(1);
    expect(page.total).toBe(200);
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: false }]);
    expect(supabase.calls).toContainEqual(["limit", 1]);
  });

  it("counts without fetching any rows when limit is 0", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 200 } satisfies MockResponse,
    });

    const page = await listLeadsPage({ limit: 0 }, supabase);

    expect(page).toEqual({ leads: [], total: 200 });
    // head:true means Postgres reports the count and sends no body.
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: true }]);
    expect(supabase.calls).not.toContainEqual(["limit", 0]);
  });

  it("applies the same filters to the count as to the rows", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 3 } satisfies MockResponse,
    });

    await listLeadsPage({ status: "qualified", q: "flood", minScore: 10, maxScore: 90 }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "qualified"]);
    expect(supabase.calls).toContainEqual(["ilike", "loss_summary", "%flood%"]);
    expect(supabase.calls).toContainEqual(["gte", "lead_score", 10]);
    expect(supabase.calls).toContainEqual(["lte", "lead_score", 90]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(listLeadsPage({}, supabase)).rejects.toThrow(/listLeadsPage failed: db down/);
  });
});

describe("listLeadSummariesPage", () => {
  it("fetches only the summary columns, never the heavy ones", async () => {
    // The whole point of the trim: metadata, the loss/keyword arrays and the extra
    // timestamps are never even read over the wire. If this select ever widened to
    // "*", the summary would silently ship exactly the weight it exists to drop.
    const supabase = createSupabaseQueryMock({
      leads: { data: [validLeadRow], error: null, count: 1 } satisfies MockResponse,
    });

    await listLeadSummariesPage({ limit: 25 }, supabase);

    expect(supabase.calls).toContainEqual(["select", LEAD_SUMMARY_COLUMNS, { count: "exact", head: false }]);
    for (const heavy of [
      "metadata",
      "loss_signals",
      "matched_target_keywords",
      "matched_non_target_keywords",
      "created_at",
      "updated_at",
      "external_lead_id",
      "property_id",
    ]) {
      expect(LEAD_SUMMARY_COLUMNS).not.toContain(heavy);
    }
  });

  it("parses each row down to the summary shape, dropping the rest", async () => {
    // Belt to the select's braces: even handed a full DB row, the summary schema
    // emits only the summary keys — no metadata/arrays/timestamps reach the caller.
    const supabase = createSupabaseQueryMock({
      leads: { data: [validLeadRow], error: null, count: 200 } satisfies MockResponse,
    });

    const page = await listLeadSummariesPage({ limit: 1 }, supabase);

    expect(page.total).toBe(200);
    expect(page.leads).toHaveLength(1);
    expect(page.leads[0]).toEqual({
      id: validLeadRow.id,
      companyId: validLeadRow.company_id,
      contactId: validLeadRow.contact_id,
      persona: validLeadRow.persona,
      status: validLeadRow.status,
      routingRecommendation: validLeadRow.routing_recommendation,
      source: validLeadRow.source,
      lossSummary: validLeadRow.loss_summary,
      leadScore: validLeadRow.lead_score,
      receivedAt: validLeadRow.received_at,
    });
    expect(page.leads[0]).not.toHaveProperty("metadata");
    expect(page.leads[0]).not.toHaveProperty("lossSignals");
    expect(page.leads[0]).not.toHaveProperty("createdAt");
  });

  it("counts without fetching any rows when limit is 0", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 200 } satisfies MockResponse,
    });

    const page = await listLeadSummariesPage({ limit: 0 }, supabase);

    expect(page).toEqual({ leads: [], total: 200 });
    expect(supabase.calls).toContainEqual(["select", LEAD_SUMMARY_COLUMNS, { count: "exact", head: true }]);
    expect(supabase.calls).not.toContainEqual(["limit", 0]);
  });

  it("applies the same filters to the count as to the rows", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 3 } satisfies MockResponse,
    });

    await listLeadSummariesPage({ status: "qualified", q: "flood", minScore: 10, maxScore: 90 }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "qualified"]);
    expect(supabase.calls).toContainEqual(["ilike", "loss_summary", "%flood%"]);
    expect(supabase.calls).toContainEqual(["gte", "lead_score", 10]);
    expect(supabase.calls).toContainEqual(["lte", "lead_score", 90]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(listLeadSummariesPage({}, supabase)).rejects.toThrow(/listLeadSummariesPage failed: db down/);
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

  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: validLeadRow, error: null },
    });

    await getLead(validLeadRow.id, supabase, { orgId: "org-1" });

    expect(supabase.calls).toContainEqual(["eq", "id", validLeadRow.id]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
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

  it("applies the score and free-text filters it accepts", async () => {
    // Regression: countLeads took the full ListLeadsFilter but only ever applied
    // org/status/persona/source, so `q`/`minScore`/`maxScore` were accepted and
    // silently dropped — a count that confidently answered a wider question than
    // it was asked. Every read now shares one filter chain.
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 2 } satisfies MockResponse,
    });

    await countLeads({ q: "flood", minScore: 40, maxScore: 90 }, supabase);

    expect(supabase.calls).toContainEqual(["ilike", "loss_summary", "%flood%"]);
    expect(supabase.calls).toContainEqual(["gte", "lead_score", 40]);
    expect(supabase.calls).toContainEqual(["lte", "lead_score", 90]);
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
