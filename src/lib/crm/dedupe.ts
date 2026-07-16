import { type SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmailKey } from "@/domain";

// Dedup lookups for operator-created CRM records. The machine import path already
// has one (findExistingLeadByExternalId, keyed on the source system's id); the
// operator "Add contact" form had none, so re-adding someone silently created a
// second row. This is the persistence layer src/domain/crm-matching.ts was written
// for — it owns the normalized keys, this owns the query.
//
// Org-scoped by contract: the lookup filters org_id, so it can never match another
// tenant's contact (the service-role client bypasses RLS, so this in-code filter IS
// the boundary — see docs/TENANCY.md).

export type ExistingContact = { id: string; name: string };

/**
 * Find a contact in this org that already uses `email`. Email is the only key the
 * operator form collects that identifies a person: two real people genuinely share
 * a name, and a company's main line is genuinely shared, so matching on those would
 * block legitimate records. No email ⇒ no dedup (nothing reliable to match on).
 *
 * Best-effort: a query error resolves to null, so a lookup blip degrades to
 * "let the insert through" rather than blocking the operator's write — the same
 * tradeoff findExistingLeadByExternalId makes.
 */
export async function findExistingContactByEmail(
  client: SupabaseClient,
  orgId: string,
  email: string | null | undefined,
): Promise<ExistingContact | null> {
  const key = normalizeEmailKey(email);
  if (!key) return null;

  // ILIKE gives case-insensitive matching, but it also treats % and _ as
  // wildcards — and `_` is common in real addresses. Unescaped, "a_b@x.com"
  // would match "axb@x.com" and block an unrelated person. Escape them so the
  // pattern is a literal, case-insensitive equality.
  const literal = key.replace(/([\\%_])/g, "\\$1");

  const { data, error } = await client
    .from("contacts")
    .select("id,full_name")
    .eq("org_id", orgId)
    .ilike("email", literal)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; full_name: string | null }>();

  if (error || !data) return null;
  return { id: data.id, name: data.full_name?.trim() || "An existing contact" };
}
