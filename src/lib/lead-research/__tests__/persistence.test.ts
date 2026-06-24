import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedLeadResearchInput } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/interactions/persistence", () => ({
  insertActivity: vi.fn(async () => ({ ok: true, id: "activity-1" })),
}));

import { insertActivity } from "@/lib/interactions/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { persistLeadResearch } from "../persistence";

const getSupabaseMock = vi.mocked(getSupabaseAdminClient);

function insertFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table) {
      const next = supabase.calls[i + 1];
      if (next && next[0] === "insert") out.push(next[1] as Record<string, unknown>);
    }
  }
  return out;
}

const input: ParsedLeadResearchInput = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing", websiteUrl: "https://acme.example", phone: null, email: null },
  contacts: [{ firstName: "Dana", lastName: "Lee", title: "Owner", email: "dana@acme.example", phone: null }],
  property: null,
  evidence: [{ url: "https://acme.example/about", note: null }],
  confidence: 0.8,
  existingCompanyId: null,
  existingContactId: null,
};

beforeEach(() => {
  getSupabaseMock.mockReset();
  vi.mocked(insertActivity).mockClear();
});

describe("persistLeadResearch", () => {
  it("creates company, contact, and lead when nothing matches", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [{ data: null, error: null }, { data: { id: "company-1" }, error: null }],
      contacts: [{ data: null, error: null }, { data: { id: "contact-1" }, error: null }],
      leads: { data: { id: "lead-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const result = await persistLeadResearch(input, { orgId: "org-1" });

    expect(result).toEqual({
      ok: true,
      companyId: "company-1",
      contactIds: ["contact-1"],
      leadId: "lead-1",
      enriched: false,
    });
    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      org_id: "org-1",
      company_id: "company-1",
      contact_id: "contact-1",
      persona: "persona_plumbing_partner",
      source: "arc_research",
      status: "needs_review",
      routing_recommendation: "target",
      loss_signals: [],
      lead_score: 0,
    });
    expect(insertFor(supabase, "companies")[0]).toMatchObject({
      name: "Acme Plumbing",
      website_url: "https://acme.example",
      org_id: "org-1",
    });
  });

  it("enriches only blank fields on a matched company without inserting a duplicate", async () => {
    const supabase = createSupabaseQueryMock({
      companies: { data: { id: "company-1", website_url: "https://existing.example", phone: null, email: null }, error: null },
      contacts: [{ data: null, error: null }, { data: { id: "contact-1" }, error: null }],
      leads: { data: { id: "lead-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const withPhone: ParsedLeadResearchInput = {
      ...input,
      company: { name: "Acme Plumbing", websiteUrl: "https://acme.example", phone: "3125550100", email: null },
    };

    const result = await persistLeadResearch(withPhone, { orgId: "org-1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.enriched).toBe(true);
    expect(insertFor(supabase, "companies")).toHaveLength(0);
    const updateCall = supabase.calls.find((c) => c[0] === "update");
    expect(updateCall?.[1]).toEqual({ phone: "3125550100" });
  });

  it("enriches blank fields on a matched contact instead of inserting a duplicate", async () => {
    const supabase = createSupabaseQueryMock({
      companies: [{ data: null, error: null }, { data: { id: "company-1" }, error: null }],
      contacts: {
        data: { id: "contact-1", first_name: "Dana", last_name: "Lee", title: null, email: "dana@acme.example", phone: null },
        error: null,
      },
      leads: { data: { id: "lead-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const result = await persistLeadResearch(input, { orgId: "org-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.enriched).toBe(true);
      expect(result.contactIds).toEqual(["contact-1"]);
    }
    // matched by email → enriched in place, no duplicate contact inserted
    expect(insertFor(supabase, "contacts")).toHaveLength(0);
    // only the contact's blank `title` is filled; name/email already set are untouched
    const updateCall = supabase.calls.find((c) => c[0] === "update");
    expect(updateCall?.[1]).toEqual({ title: "Owner" });
  });

  it("returns an error when Supabase is not configured", async () => {
    const { isSupabaseAdminConfigured } = await import("@/lib/supabase/server");
    vi.mocked(isSupabaseAdminConfigured).mockReturnValueOnce(false);
    const result = await persistLeadResearch(input, { orgId: "org-1" });
    expect(result.ok).toBe(false);
  });
});
