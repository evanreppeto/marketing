import { type SupabaseClient } from "@supabase/supabase-js";

import { type Contact, ContactSchema, type ContactStatus } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListContactsFilter = {
  status?: ContactStatus;
  persona?: string;
  companyId?: string;
  /** Free-text search over full name / email (case-insensitive). */
  q?: string;
  limit?: number;
};

export async function listContacts(
  filter: ListContactsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Contact[]> {
  let query = client.from("contacts").select("*");

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.companyId) {
    query = query.eq("company_id", filter.companyId);
  }
  if (filter.q) {
    query = query.or(`full_name.ilike.%${filter.q}%,email.ilike.%${filter.q}%`);
  }
  if (typeof filter.limit === "number") {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listContacts failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => ContactSchema.parse(row));
}

export async function getContact(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Contact | null> {
  const { data, error } = await client.from("contacts").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getContact failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return ContactSchema.parse(data);
}
