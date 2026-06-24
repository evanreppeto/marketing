import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Partner Directory ingest: validate the wire payload pushed by Big Shoulders
 * and upsert each partner into `companies` (+ a linked `contacts` row) scoped
 * to the caller's org. Idempotency key is (org_id, metadata.source_plumber_id),
 * backed by the partial unique indexes in
 * 20260624120000_partner_sync_source_indexes.sql.
 */

const activeFrameworkEntry = z.object({
  completed: z.boolean(),
  note: z.string().nullable(),
});

export const partnerRecordSchema = z.object({
  source_id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().nullish(),
  primary_contact: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  relationship_stage: z.string().nullish(),
  last_visit_date: z.string().nullish(),
  next_planned_visit: z.string().nullish(),
  next_visit_time: z.string().nullish(),
  general_notes: z.string().nullish(),
  active_framework: z.record(z.string(), activeFrameworkEntry).nullish(),
});

export type PartnerRecord = z.infer<typeof partnerRecordSchema>;

export const ingestPayloadSchema = z.object({
  partners: z.array(partnerRecordSchema).min(1).max(500),
});

export type IngestScope = { orgId: string; workspaceId: string };
export type IngestError = { source_id: string; message: string };
export type IngestResult = { created: number; updated: number; errors: IngestError[] };

const PARTNER_PERSONA = "persona_plumbing_partner";

function mapStatus(input: string | null | undefined): "active" | "inactive" {
  return (input ?? "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

function splitName(name: string): { first_name: string; last_name: string | null } {
  const trimmed = name.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) return { first_name: trimmed, last_name: null };
  return { first_name: trimmed.slice(0, space), last_name: trimmed.slice(space + 1).trim() || null };
}

function buildMetadata(r: PartnerRecord): Record<string, unknown> {
  return {
    source: "bsr-bd",
    source_plumber_id: r.source_id,
    relationship_stage: r.relationship_stage ?? null,
    last_visit_date: r.last_visit_date ?? null,
    next_planned_visit: r.next_planned_visit ?? null,
    next_visit_time: r.next_visit_time ?? null,
    address: r.address ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    general_notes: r.general_notes ?? null,
    active_framework: r.active_framework ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertCompany(
  supabase: SupabaseClient,
  scope: IngestScope,
  r: PartnerRecord,
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error: lookupError } = await supabase
    .from("companies")
    .select("id")
    .eq("org_id", scope.orgId)
    .eq("metadata->>source_plumber_id", r.source_id)
    .maybeSingle<{ id: string }>();
  if (lookupError) throw new Error(lookupError.message);

  const payload = {
    org_id: scope.orgId,
    name: r.name,
    persona: PARTNER_PERSONA,
    status: mapStatus(r.status),
    phone: r.phone ?? null,
    email: r.email ?? null,
    metadata: buildMetadata(r),
  };

  if (existing?.id) {
    const { error } = await supabase.from("companies").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "company insert returned no row");
  return { id: data.id, created: true };
}

async function upsertContact(
  supabase: SupabaseClient,
  scope: IngestScope,
  companyId: string,
  r: PartnerRecord,
): Promise<void> {
  const contactName = (r.primary_contact ?? "").trim();
  if (!contactName) return;

  const { data: existing, error: lookupError } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", scope.orgId)
    .eq("metadata->>source_plumber_id", r.source_id)
    .maybeSingle<{ id: string }>();
  if (lookupError) throw new Error(lookupError.message);

  const { first_name, last_name } = splitName(contactName);
  const payload = {
    org_id: scope.orgId,
    company_id: companyId,
    persona: PARTNER_PERSONA,
    status: "active",
    first_name,
    last_name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    metadata: { source: "bsr-bd", source_plumber_id: r.source_id },
  };

  if (existing?.id) {
    const { error } = await supabase.from("contacts").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("contacts").insert(payload);
  if (error) throw new Error(error.message);
}

export async function ingestPartners(
  supabase: SupabaseClient,
  scope: IngestScope,
  partners: PartnerRecord[],
): Promise<IngestResult> {
  const result: IngestResult = { created: 0, updated: 0, errors: [] };

  for (const r of partners) {
    try {
      const company = await upsertCompany(supabase, scope, r);
      await upsertContact(supabase, scope, company.id, r);
      if (company.created) result.created += 1;
      else result.updated += 1;
    } catch (error) {
      result.errors.push({
        source_id: r.source_id,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return result;
}
