import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { findExistingContactByEmail } from "./dedupe";

const ORG = "org-1";
const HIT = { id: "contact-1", full_name: "Jordan Vega" };

/** The `ilike` pattern the lookup actually sent, for asserting escaping. */
function ilikePattern(supabase: { calls: Array<[string, ...unknown[]]> }): string | undefined {
  const call = supabase.calls.find(([m]) => m === "ilike");
  return call?.[2] as string | undefined;
}

describe("findExistingContactByEmail", () => {
  it("finds a contact already using that email", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: HIT, error: null } });
    await expect(findExistingContactByEmail(supabase, ORG, "jordan@bsr.com")).resolves.toEqual({
      id: "contact-1",
      name: "Jordan Vega",
    });
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: HIT, error: null } });
    const found = await findExistingContactByEmail(supabase, ORG, "  JORDAN@BSR.com  ");
    expect(found?.id).toBe("contact-1");
    // normalizeEmailKey lowercases + trims before the query.
    expect(ilikePattern(supabase)).toBe("jordan@bsr.com");
  });

  it("escapes LIKE wildcards so an address with _ or % can't match a different person", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: null, error: null } });
    await findExistingContactByEmail(supabase, ORG, "a_b%c@bsr.com");
    // Unescaped, "a_b%c@bsr.com" would match "axbZZc@bsr.com" and block an
    // unrelated contact from being created.
    expect(ilikePattern(supabase)).toBe("a\\_b\\%c@bsr.com");
  });

  it("scopes the lookup to the org", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: null, error: null } });
    await findExistingContactByEmail(supabase, ORG, "jordan@bsr.com");
    expect(supabase.calls).toContainEqual(["eq", "org_id", ORG]);
  });

  it("returns null when there is no email to match on", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: HIT, error: null } });
    await expect(findExistingContactByEmail(supabase, ORG, null)).resolves.toBeNull();
    await expect(findExistingContactByEmail(supabase, ORG, "   ")).resolves.toBeNull();
    // No email ⇒ no query at all; nothing to dedup on.
    expect(supabase.calls).toHaveLength(0);
  });

  it("returns null when nothing matches", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: null, error: null } });
    await expect(findExistingContactByEmail(supabase, ORG, "new@bsr.com")).resolves.toBeNull();
  });

  it("is best-effort — a read error degrades to 'no match' rather than blocking the write", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: null, error: { message: "boom" } } });
    await expect(findExistingContactByEmail(supabase, ORG, "jordan@bsr.com")).resolves.toBeNull();
  });

  it("falls back to a readable label when the match has no name", async () => {
    const supabase = createSupabaseQueryMock({ contacts: { data: { id: "c2", full_name: null }, error: null } });
    const found = await findExistingContactByEmail(supabase, ORG, "jordan@bsr.com");
    expect(found?.name).toBe("An existing contact");
  });
});
