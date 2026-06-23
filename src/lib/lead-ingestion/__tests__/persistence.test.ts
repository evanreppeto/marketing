import { describe, expect, it } from "vitest";

import { parseLeadIngestionPayload } from "../../../domain";

import { persistLeadIngestion } from "../persistence";

type InsertCall = {
  table: string;
  values: Record<string, unknown>;
};

function createSupabaseMock() {
  const calls: InsertCall[] = [];
  const ids = ["company-1", "contact-1", "property-1", "lead-1"];

  return {
    calls,
    client: {
      from(table: string) {
        return {
          insert(values: Record<string, unknown>) {
            calls.push({ table, values });

            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: ids[calls.length - 1] },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

describe("lead ingestion persistence", () => {
  it("persists company, contact, property, and lead records in relational order", async () => {
    const result = parseLeadIngestionPayload(
      {
        persona: "persona_homeowner_emergency",
        source: "website",
        externalLeadId: "web-100",
        company: {
          name: "West Loop Property Group",
          partnerTier: "B",
          networkConnection: "warm_intro",
        },
        contact: {
          firstName: "Marlene",
          lastName: "Vega",
          phone: "312-555-0148",
        },
        property: {
          streetLine1: "1234 W Addison St",
          city: "Chicago",
          state: "il",
          postalCode: "60613",
        },
        lossSummary: "Basement flooding after burst pipe",
        lossSignals: ["standing water", "burst pipe"],
        metadata: {
          photo_uploaded: true,
        },
      },
      "2026-05-27T17:00:00.000Z",
    );

    if (!result.ok) {
      throw new Error("Expected payload to parse successfully.");
    }

    const { calls, client } = createSupabaseMock();
    const persisted = await persistLeadIngestion({
      input: result.normalizedInput,
      result,
      // The persistence helper only relies on the from().insert().select().single() subset here.
      supabase: client as never,
      orgId: "org-test",
    });

    expect(persisted).toEqual({
      companyId: "company-1",
      contactId: "contact-1",
      propertyId: "property-1",
      leadId: "lead-1",
    });
    expect(calls.map((call) => call.table)).toEqual(["companies", "contacts", "properties", "leads"]);
    expect(calls[0].values).toMatchObject({
      name: "West Loop Property Group",
      persona: "persona_homeowner_emergency",
      partner_tier: "B",
      org_id: "org-test",
    });
    expect(calls[2].values).toMatchObject({
      company_id: "company-1",
      contact_id: "contact-1",
      state: "IL",
    });
    expect(calls[3].values).toMatchObject({
      company_id: "company-1",
      contact_id: "contact-1",
      property_id: "property-1",
      status: "validated",
      routing_recommendation: "elevated",
      lead_score: 70,
    });
  });

  it("stores a partial address as location metadata on the company and lead instead of dropping it", async () => {
    // Mirrors apps/arc-runner/src/tools/crm-write.ts create_lead with a partial
    // address: no full `property` (so no properties row), but the location is
    // preserved on both the company and lead metadata.
    const result = parseLeadIngestionPayload({
      persona: "persona_plumbing_partner",
      source: "arc_discovery",
      company: { name: "Halsted Plumbing Co" },
      location: {
        streetLine1: undefined,
        streetLine2: undefined,
        city: "Chicago",
        state: "il",
        postalCode: undefined,
      },
    });

    if (!result.ok) {
      throw new Error("Expected payload to parse successfully.");
    }

    const { calls, client } = createSupabaseMock();
    await persistLeadIngestion({
      input: result.normalizedInput,
      result,
      supabase: client as never,
      orgId: "org-test",
    });

    // No properties row is written for a partial address.
    expect(calls.map((call) => call.table)).toEqual(["companies", "leads"]);

    const companyCall = calls.find((call) => call.table === "companies");
    expect((companyCall?.values.metadata as Record<string, unknown>).location).toEqual({
      city: "Chicago",
      state: "IL",
    });

    const leadCall = calls.find((call) => call.table === "leads");
    expect((leadCall?.values.metadata as Record<string, unknown>).location).toEqual({
      city: "Chicago",
      state: "IL",
    });
  });

  it("stores needs-review API routing as target so the current database enum accepts it", async () => {
    const result = parseLeadIngestionPayload(
      {
        persona: "persona_property_manager",
        source: "manual",
        contact: {
          email: "manager@example.com",
        },
        lossSummary: "Moisture concern under sink",
        lossSignals: ["moisture concern"],
      },
      "2026-05-27T17:00:00.000Z",
    );

    if (!result.ok) {
      throw new Error("Expected payload to parse successfully.");
    }

    const { calls, client } = createSupabaseMock();
    await persistLeadIngestion({
      input: result.normalizedInput,
      result,
      supabase: client as never,
      orgId: "org-test",
    });

    expect(result.routing).toBe("needs_review");
    expect(calls.at(-1)?.values).toMatchObject({
      status: "validated",
      routing_recommendation: "target",
    });
  });
});
