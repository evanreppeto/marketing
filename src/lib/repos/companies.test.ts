import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { getCompany, listCompanies } from "./companies";

const validCompanyRow = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Lakeshore Property Group",
  persona: "persona_insurance_agent",
  status: "active",
  website_url: "https://example.com",
  phone: null,
  email: null,
  partner_tier: "A",
  metadata: {},
  created_at: "2026-05-28T09:00:00.000Z",
  updated_at: "2026-05-28T09:00:00.000Z",
};

describe("listCompanies", () => {
  it("returns parsed Company objects ordered by created_at desc", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: [validCompanyRow], error: null } });

    const companies = await listCompanies({}, supabase);

    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ id: validCompanyRow.id, name: validCompanyRow.name, partnerTier: "A" });
    expect(supabase.calls).toContainEqual(["from", "companies"]);
    expect(supabase.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("applies status, persona, and limit filters", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: [], error: null } });

    await listCompanies({ status: "active", persona: "persona_insurance_agent", limit: 10 }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "active"]);
    expect(supabase.calls).toContainEqual(["eq", "persona", "persona_insurance_agent"]);
    expect(supabase.calls).toContainEqual(["limit", 10]);
  });

  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: [], error: null } });

    await listCompanies({ orgId: "org-1" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });

  it("applies a name search (ilike) and partner_tier filter", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: [], error: null } });

    await listCompanies({ q: "Plumbing", partnerTier: "A" }, supabase);

    expect(supabase.calls).toContainEqual(["ilike", "name", "%Plumbing%"]);
    expect(supabase.calls).toContainEqual(["eq", "partner_tier", "A"]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: null, error: { message: "db down" } } });
    await expect(listCompanies({}, supabase)).rejects.toThrow(/listCompanies failed: db down/);
  });
});

describe("getCompany", () => {
  it("returns a single parsed Company when found", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: validCompanyRow, error: null } });

    const company = await getCompany(validCompanyRow.id, supabase);

    expect(company).toMatchObject({ id: validCompanyRow.id });
    expect(supabase.calls).toContainEqual(["eq", "id", validCompanyRow.id]);
    expect(supabase.calls).toContainEqual(["maybeSingle"]);
  });

  it("returns null when no row is found", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: null, error: null } });
    await expect(getCompany("missing", supabase)).resolves.toBeNull();
  });
});
