import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { getContact, listContacts } from "./contacts";

const validContactRow = {
  id: "30000000-0000-4000-8000-000000000001",
  company_id: "20000000-0000-4000-8000-000000000001",
  persona: "persona_insurance_agent",
  status: "active",
  first_name: "Dana",
  last_name: "Reyes",
  full_name: "Dana Reyes",
  email: "dana@example.com",
  phone: null,
  title: "Adjuster",
  metadata: {},
  created_at: "2026-05-28T09:00:00.000Z",
  updated_at: "2026-05-28T09:00:00.000Z",
};

describe("listContacts", () => {
  it("returns parsed Contact objects ordered by created_at desc", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: [validContactRow], error: null } });

    const contacts = await listContacts({}, supabase);

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ id: validContactRow.id, fullName: "Dana Reyes", companyId: validContactRow.company_id });
    expect(supabase.calls).toContainEqual(["from", "contacts"]);
    expect(supabase.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("applies a companyId filter via .eq company_id", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: [], error: null } });

    await listContacts({ companyId: validContactRow.company_id }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "company_id", validContactRow.company_id]);
  });

  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: [], error: null } });

    await listContacts({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });
});

describe("getContact", () => {
  it("returns null when no row is found", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: null, error: null } });
    await expect(getContact("missing", supabase)).resolves.toBeNull();
  });
});
