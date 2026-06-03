import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getCrmObjectData } from "./read-model";

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
