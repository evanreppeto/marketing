import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Display names for CRM records referenced by foreign key.
 *
 * leads, jobs and outcomes carry company_id/contact_id and no names, so anything
 * rendering them has only a uuid to show. That produced two of the same bug in
 * different places: the Opportunity Inbox titled 64 cards "Lead c1aa307a", and Arc
 * — whose CRM tools return these rows verbatim — wrote uuids into operator-facing
 * prose:
 *
 *   "outcome f17d059a (won, $12,400) ... their companies 08b76650, 5ddcc386,
 *    27333a56 are all tagged plumbing_partner"
 *
 * The names were always one keyed lookup away. This owns that lookup so the next
 * caller doesn't hand-roll a third copy.
 *
 * Org-scoped by contract: pass the caller's orgId. The service-role client
 * bypasses RLS, so this in-code filter IS the boundary (see docs/TENANCY.md). The
 * ids come from already-scoped rows, so this is defence in depth rather than the
 * only guard — but a name is exactly the kind of thing that leaks a tenant.
 */

type NameTable = { table: "companies" | "contacts"; column: "name" | "full_name" };

const COMPANIES: NameTable = { table: "companies", column: "name" };
const CONTACTS: NameTable = { table: "contacts", column: "full_name" };

async function fetchNames(
  spec: NameTable,
  ids: Array<string | null | undefined>,
  orgId: string | null,
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  // Never issue `.in("id", [])` — it is a query with a guaranteed-empty answer.
  if (unique.length === 0) return new Map();

  const db = client ?? getSupabaseAdminClient();
  let query = db.from(spec.table).select(`id, ${spec.column}`).in("id", unique);
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
  // A blank name is the same as no name: callers fall back rather than render "".
  return new Map(
    rows
      .filter((r) => r.id && (r[spec.column] ?? "").trim())
      .map((r) => [r.id as string, (r[spec.column] as string).trim()]),
  );
}

export type CrmNameMaps = {
  /** company id -> company name */
  companies: Map<string, string>;
  /** contact id -> contact full name */
  contacts: Map<string, string>;
};

/** Resolve company + contact names for a batch of FK-carrying rows. Two queries, not N. */
export async function resolveCrmNames(
  rows: Array<{ companyId?: string | null; contactId?: string | null }>,
  orgId: string | null,
  client?: SupabaseClient,
): Promise<CrmNameMaps> {
  const [companies, contacts] = await Promise.all([
    fetchNames(COMPANIES, rows.map((r) => r.companyId), orgId, client),
    fetchNames(CONTACTS, rows.map((r) => r.contactId), orgId, client),
  ]);
  return { companies, contacts };
}

/** Company names only, keyed by id. */
export async function resolveCompanyNames(
  ids: Array<string | null | undefined>,
  orgId: string | null,
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  return fetchNames(COMPANIES, ids, orgId, client);
}

/** Contact names only, keyed by id. */
export async function resolveContactNames(
  ids: Array<string | null | undefined>,
  orgId: string | null,
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  return fetchNames(CONTACTS, ids, orgId, client);
}

/**
 * Attach `companyName`/`contactName` to a row. Null when the record has no such
 * link, or when the name is missing — never the uuid, which is what a caller with
 * no name reaches for and is the whole problem.
 */
export function withCrmNames<T extends { companyId?: string | null; contactId?: string | null }>(
  row: T,
  names: CrmNameMaps,
): T & { companyName: string | null; contactName: string | null } {
  return {
    ...row,
    companyName: row.companyId ? (names.companies.get(row.companyId) ?? null) : null,
    contactName: row.contactId ? (names.contacts.get(row.contactId) ?? null) : null,
  };
}

/**
 * Like `withCrmNames`, but REPLACES the raw `companyId`/`contactId` with the
 * resolved names instead of carrying both. For compact list projections (Arc's
 * lead search) where the uuids are pure weight once the name is attached — and a
 * uuid is exactly the kind of thing that should never reach operator-facing prose.
 * Same null-fallback as `withCrmNames`: a missing name is `null`, never the uuid.
 */
export function withCrmNamesCompact<T extends { companyId?: string | null; contactId?: string | null }>(
  row: T,
  names: CrmNameMaps,
): Omit<T, "companyId" | "contactId"> & { companyName: string | null; contactName: string | null } {
  const { companyId, contactId, ...rest } = row;
  return {
    ...rest,
    companyName: companyId ? (names.companies.get(companyId) ?? null) : null,
    contactName: contactId ? (names.contacts.get(contactId) ?? null) : null,
  };
}
