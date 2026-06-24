import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { ingestPayloadSchema, ingestPartners } from "./ingest";

const SCOPE = { orgId: "org-1", workspaceId: "ws-1" };

function record(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "plumber-1",
    name: "Acme Plumbing",
    status: "Active",
    primary_contact: "John Smith",
    phone: "+13125550100",
    email: "john@acme.com",
    address: "123 W Main St, Chicago, IL 60601",
    latitude: 41.88,
    longitude: -87.63,
    relationship_stage: "CP2",
    last_visit_date: "2026-06-01",
    next_planned_visit: "2026-06-20",
    next_visit_time: null,
    general_notes: "Great partner",
    active_framework: {
      a: { completed: true, note: "reachable" },
      c: { completed: false, note: null },
    },
    ...overrides,
  };
}

describe("ingestPayloadSchema", () => {
  it("rejects an empty partners array", () => {
    expect(ingestPayloadSchema.safeParse({ partners: [] }).success).toBe(false);
  });

  it("rejects a record missing source_id", () => {
    const bad = record();
    delete (bad as Record<string, unknown>).source_id;
    expect(ingestPayloadSchema.safeParse({ partners: [bad] }).success).toBe(false);
  });

  it("accepts a well-formed record", () => {
    expect(ingestPayloadSchema.safeParse({ partners: [record()] }).success).toBe(true);
  });
});

describe("ingestPartners", () => {
  it("inserts a new company + contact and counts it as created", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [
        { data: null, error: null },
        { data: { id: "company-1" }, error: null },
      ],
      contacts: [
        { data: null, error: null },
        { data: { id: "contact-1" }, error: null },
      ],
    });

    const result = await ingestPartners(supabase, SCOPE, [record()]);

    expect(result).toEqual({ created: 1, updated: 0, errors: [] });

    const companyInsert = supabase.calls.find(
      ([m, arg]) => m === "insert" && (arg as { name?: string }).name === "Acme Plumbing",
    );
    expect(companyInsert).toBeTruthy();
    const payload = companyInsert![1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      org_id: "org-1",
      name: "Acme Plumbing",
      status: "active",
      persona: "persona_plumbing_partner",
    });
    expect((payload.metadata as Record<string, unknown>).source_plumber_id).toBe("plumber-1");
  });

  it("updates an existing company and counts it as updated", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [{ data: { id: "company-1" }, error: null }],
      contacts: [{ data: { id: "contact-1" }, error: null }],
    });

    const result = await ingestPartners(supabase, SCOPE, [record()]);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it("isolates a per-record failure into errors[] without throwing", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [{ data: null, error: { message: "boom" } }],
    });

    const result = await ingestPartners(supabase, SCOPE, [record()]);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ source_id: "plumber-1" });
  });

  it("skips contact creation when primary_contact is empty", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [
        { data: null, error: null },
        { data: { id: "company-1" }, error: null },
      ],
    });

    const result = await ingestPartners(supabase, SCOPE, [record({ primary_contact: "" })]);
    expect(result.created).toBe(1);
    const touchedContacts = supabase.calls.some(([m, arg]) => m === "from" && arg === "contacts");
    expect(touchedContacts).toBe(false);
  });
});
