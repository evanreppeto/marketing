import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getCrmObjectData, getCrmOverviewData } from "./read-model";

function leadBundle(overrides: { leads: unknown[]; companies?: unknown[] }) {
  return createSupabaseQueryMock({
    companies: { data: overrides.companies ?? [], error: null },
    contacts: { data: [], error: null },
    properties: { data: [], error: null },
    leads: { data: overrides.leads, error: null },
    jobs: { data: [], error: null },
    outcomes: { data: [], error: null },
  });
}

const baseLead = {
  id: "ld-1",
  contact_id: null,
  property_id: null,
  status: "validated",
  routing_recommendation: "target",
  received_at: "2026-06-23T00:00:00.000Z",
  metadata: {},
  created_at: "2026-06-23T00:00:00.000Z",
  updated_at: "2026-06-23T00:00:00.000Z",
};

describe("lead display name + score (pipeline board)", () => {
  it("names a prospect lead by its company and scores it by partner fit, not the damage base 10", async () => {
    const supabase = leadBundle({
      companies: [{ id: "co-1", name: "COUNTRY Financial - Evanston", persona: "persona_insurance_agent", status: "active", website_url: null, phone: null, email: null, partner_tier: null, metadata: {}, created_at: "2026-06-23T00:00:00.000Z", updated_at: "2026-06-23T00:00:00.000Z" }],
      leads: [{ ...baseLead, company_id: "co-1", persona: "persona_insurance_agent", source: "web_research", loss_summary: null, loss_signals: [], lead_score: 10 }],
    });

    const result = await getCrmOverviewData(supabase);
    if (result.status !== "live") throw new Error("expected live overview");
    const row = result.rows.find((r) => r.id === "ld-1");

    expect(row?.record).toBe("COUNTRY Financial - Evanston");
    expect(row?.record).not.toBe("Web Research");
    expect(row?.score).toBe(40); // partnerScore(null) baseline, not the damage base 10
  });

  it("keeps a real damage lead's loss-summary name and its damage score", async () => {
    const supabase = leadBundle({
      leads: [{ ...baseLead, id: "ld-2", company_id: null, persona: "persona_homeowner_emergency", source: "web_form", loss_summary: "Burst pipe flooded the basement", loss_signals: ["standing_water"], lead_score: 92 }],
    });

    const result = await getCrmOverviewData(supabase);
    if (result.status !== "live") throw new Error("expected live overview");
    const row = result.rows.find((r) => r.id === "ld-2");

    expect(row?.record).toBe("Burst pipe flooded the basement");
    expect(row?.score).toBe(92);
  });
});

describe("getCrmObjectData", () => {
  it("keeps CRM object rows beyond the old 100-row bundle cap", async () => {
    const contacts = Array.from({ length: 118 }, (_, index) => ({
      id: `contact-${index + 1}`,
      company_id: null,
      persona: "persona_property_manager",
      status: "active",
      first_name: `Contact`,
      last_name: `${index + 1}`,
      full_name: `Contact ${index + 1}`,
      email: `contact${index + 1}@example.com`,
      phone: null,
      title: "Property manager",
      metadata: { owner: "Robby" },
      created_at: `2026-06-02T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      updated_at: `2026-06-02T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));

    const supabase = createSupabaseQueryMock({
      companies: { data: [], error: null },
      contacts: { data: contacts, error: null },
      properties: { data: [], error: null },
      leads: { data: [], error: null },
      jobs: { data: [], error: null },
      outcomes: { data: [], error: null },
    });

    const result = await getCrmObjectData("contacts", supabase);

    expect(result.status).toBe("live");
    if (result.status !== "live") return;

    expect(result.count).toBe(118);
    expect(result.sampleRows).toHaveLength(118);
    expect(result.sampleRows[117]).toMatchObject({
      id: "contact-118",
      name: "Contact 118",
      detail: "Property manager / contact118@example.com",
    });
    expect(supabase.calls).toContainEqual(["limit", 1000]);
  });
});
