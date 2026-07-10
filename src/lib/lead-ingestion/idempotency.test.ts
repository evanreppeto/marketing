import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { findExistingLeadByExternalId } from "./idempotency";

describe("findExistingLeadByExternalId", () => {
  it("returns the existing lead + attached refs when one matches", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: { id: "lead-1", company_id: "co-1", contact_id: "ct-1", property_id: null }, error: null },
    });
    const refs = await findExistingLeadByExternalId(supabase, "org-1", "hs-42");
    expect(refs).toEqual({ leadId: "lead-1", companyId: "co-1", contactId: "ct-1", propertyId: null });
  });

  it("filters by org_id and external_lead_id", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: { id: "lead-1", company_id: null, contact_id: null, property_id: null }, error: null },
    });
    await findExistingLeadByExternalId(supabase, "org-1", "hs-42");
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "external_lead_id", "hs-42"]);
  });

  it("returns null when nothing matches", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: null } });
    expect(await findExistingLeadByExternalId(supabase, "org-1", "nope")).toBeNull();
  });

  it("returns null (no query) for a blank external id", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: null } });
    expect(await findExistingLeadByExternalId(supabase, "org-1", "  ")).toBeNull();
    expect(await findExistingLeadByExternalId(supabase, "org-1", null)).toBeNull();
    expect(supabase.calls.filter((c) => c[0] === "from")).toHaveLength(0);
  });

  it("degrades to null on a query error (import falls back to insert)", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: { message: "boom" } } });
    expect(await findExistingLeadByExternalId(supabase, "org-1", "hs-42")).toBeNull();
  });
});
