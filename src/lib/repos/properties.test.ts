import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listProperties } from "./properties";

const validPropertyRow = {
  id: "60000000-0000-4000-8000-000000000001",
  company_id: null,
  contact_id: null,
  persona: "persona_insurance_agent",
  street_line_1: "123 N State St",
  street_line_2: null,
  city: "Chicago",
  state: "IL",
  postal_code: "60614",
  property_type: "commercial",
  metadata: {},
  created_at: "2026-05-28T09:00:00.000Z",
  updated_at: "2026-05-28T09:00:00.000Z",
};

describe("listProperties", () => {
  it("parses rows and applies city (ilike) + postal_code (eq) filters", async () => {
    const supabase = createSupabaseQueryMock({ properties: { data: [validPropertyRow], error: null } });

    const properties = await listProperties({ city: "Chicago", postalCode: "60614" }, supabase);

    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({ id: validPropertyRow.id, postalCode: "60614", city: "Chicago" });
    expect(supabase.calls).toContainEqual(["ilike", "city", "Chicago"]);
    expect(supabase.calls).toContainEqual(["eq", "postal_code", "60614"]);
    expect(supabase.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("applies a street search via ilike on street_line_1", async () => {
    const supabase = createSupabaseQueryMock({ properties: { data: [], error: null } });
    await listProperties({ q: "State" }, supabase);
    expect(supabase.calls).toContainEqual(["ilike", "street_line_1", "%State%"]);
  });
});
