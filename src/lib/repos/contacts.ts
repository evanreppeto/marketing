import { type SupabaseClient } from "@supabase/supabase-js";

import { type Contact, ContactSchema, type ContactStatus } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { getSupabaseAdminClient } from "@/lib/supabase/server";


export type ListContactsFilter = {
  orgId?: string;
  status?: ContactStatus;
  persona?: string;
  companyId?: string;
  /** Free-text search over full name / email (case-insensitive). */
  q?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

function applyContactFilters(
  query: FilterChain,
  filter: ListContactsFilter,
  orgId: string | null,
): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.persona) q = q.eq("persona", filter.persona);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  if (filter.q) q = q.or(`full_name.ilike.%${filter.q}%,email.ilike.%${filter.q}%`);
  return q;
}

/** A bounded page of contacts plus the exact `total` matching the same filters. */
export async function listContactsPage(
  filter: ListContactsFilter = {},
  client?: SupabaseClient,
): Promise<{ contacts: Contact[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Contact>({
    client: client ?? getSupabaseAdminClient(),
    table: "contacts",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listContactsPage",
    parse: (row) => ContactSchema.parse(row),
    applyFilters: (query) => applyContactFilters(query, filter, orgId),
  });
  return { contacts: rows, total };
}

export async function listContacts(
  filter: ListContactsFilter = {},
  client?: SupabaseClient,
): Promise<Contact[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Contact>({
    client: client ?? getSupabaseAdminClient(),
    table: "contacts",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listContacts",
    parse: (row) => ContactSchema.parse(row),
    applyFilters: (query) => applyContactFilters(query, filter, orgId),
  });
  return rows;
}

export async function getContact(
  id: string,
  client?: SupabaseClient,
): Promise<Contact | null> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("contacts").select("*").eq("id", id);
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`getContact failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return ContactSchema.parse(data);
}
