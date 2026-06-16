import { type SupabaseClient } from "@supabase/supabase-js";

import { type Contact, ContactSchema, type ContactStatus } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

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
  client?: SupabaseClient,
): Promise<Contact[]> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("contacts").select("*");

  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona as PersonaMapping);
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
