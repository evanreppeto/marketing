"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain/personas";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured, type TypedSupabaseClient } from "@/lib/supabase/server";
import { type Database, type TablesInsert, type TablesUpdate } from "@/lib/supabase/database.types";
import { isCrmEntityKey, type CrmEntityKey } from "./entity-keys";

type Persona = Database["public"]["Enums"]["persona_mapping"];
const PERSONA_VALUES = new Set<string>([...OFFICIAL_PERSONA_MAPPINGS, "unassigned_persona"]);

export async function createCrmRecordAction(formData: FormData) {
  await requireOperator();

  const objectKey = str(formData, "objectKey");
  if (!objectKey || !isCrmEntityKey(objectKey)) {
    redirect("/crm?action=crm-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect(`/crm/${objectKey}?action=not-configured`);
  }

  const supabase = getSupabaseAdminClient();
  const result = buildInsert(objectKey, formData);
  if ("error" in result) {
    redirect(`/crm/${objectKey}?action=crm-error&message=${encodeURIComponent(result.error)}`);
  }

  const orgId = await getCurrentOrgId();
  const insertWithOrg = { ...result.insert, org_id: orgId } as typeof result.insert;
  const inserted = await insertEntity(supabase, objectKey, insertWithOrg);
  if ("error" in inserted) {
    redirect(`/crm/${objectKey}?action=crm-error&message=${encodeURIComponent(inserted.error)}`);
  }

  revalidatePath(`/crm/${objectKey}`);
  revalidatePath("/crm");
  redirect(`/crm/${objectKey}/${inserted.id}?action=created`);
}

export async function updateCrmRecordAction(formData: FormData) {
  await requireOperator();

  const objectKey = str(formData, "objectKey");
  const recordId = str(formData, "recordId");
  if (!objectKey || !isCrmEntityKey(objectKey) || !recordId) {
    redirect("/crm?action=crm-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect(`/crm/${objectKey}/${recordId}?action=not-configured`);
  }

  const supabase = getSupabaseAdminClient();
  const result = buildInsert(objectKey, formData);
  if ("error" in result) {
    redirect(`/crm/${objectKey}/${recordId}?action=crm-error&message=${encodeURIComponent(result.error)}`);
  }

  const orgId = await getCurrentOrgId();
  const { error } = await supabase
    .from(objectKey)
    .update(result.insert as TablesUpdate<CrmEntityKey>)
    .eq("id", recordId)
    .eq("org_id", orgId);
  if (error) {
    redirect(`/crm/${objectKey}/${recordId}?action=crm-error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/crm/${objectKey}/${recordId}`);
  revalidatePath(`/crm/${objectKey}`);
  redirect(`/crm/${objectKey}/${recordId}?action=updated`);
}

type EntityInsert = TablesInsert<"companies"> | TablesInsert<"contacts"> | TablesInsert<"properties">;
type BuildResult = { insert: EntityInsert } | { error: string };

/**
 * Dispatch to the concrete table so the typed client checks the payload against
 * that table's Insert type (a union `.from(key)` trips the excess-property
 * guard). The payload shape was already validated per-object in buildInsert.
 */
async function insertEntity(
  supabase: TypedSupabaseClient,
  objectKey: CrmEntityKey,
  insert: EntityInsert,
): Promise<{ id: string } | { error: string }> {
  const query =
    objectKey === "companies"
      ? supabase.from("companies").insert(insert as TablesInsert<"companies">)
      : objectKey === "contacts"
        ? supabase.from("contacts").insert(insert as TablesInsert<"contacts">)
        : supabase.from("properties").insert(insert as TablesInsert<"properties">);

  const { data, error } = await query.select("id").single<{ id: string }>();
  if (error) return { error: error.message };
  return { id: data.id };
}

function buildInsert(objectKey: CrmEntityKey, formData: FormData): BuildResult {
  const persona = persona_(formData);

  if (objectKey === "companies") {
    const name = str(formData, "name");
    if (!name) return { error: "Company name is required." };
    const insert: TablesInsert<"companies"> = {
      name,
      ...(persona ? { persona } : {}),
      partner_tier: str(formData, "partner_tier") ?? null,
      website_url: str(formData, "website_url") ?? null,
      phone: str(formData, "phone") ?? null,
      email: str(formData, "email") ?? null,
    };
    return { insert };
  }

  if (objectKey === "contacts") {
    const fullName = str(formData, "full_name");
    const email = str(formData, "email");
    if (!fullName && !email) return { error: "A contact needs at least a name or an email." };
    const insert: TablesInsert<"contacts"> = {
      ...(persona ? { persona } : {}),
      full_name: fullName ?? null,
      email: email ?? null,
      phone: str(formData, "phone") ?? null,
      title: str(formData, "title") ?? null,
      company_id: str(formData, "company_id") ?? null,
    };
    return { insert };
  }

  // properties
  const street = str(formData, "street_line_1");
  const city = str(formData, "city");
  const state = str(formData, "state");
  const postal = str(formData, "postal_code");
  if (!street || !city || !state || !postal) {
    return { error: "Properties need a street, city, state, and postal code." };
  }
  const insert: TablesInsert<"properties"> = {
    street_line_1: street,
    street_line_2: str(formData, "street_line_2") ?? null,
    city,
    state,
    postal_code: postal,
    property_type: str(formData, "property_type") ?? null,
    ...(persona ? { persona } : {}),
  };
  return { insert };
}

function persona_(formData: FormData): Persona | undefined {
  const value = str(formData, "persona");
  return value && PERSONA_VALUES.has(value) ? (value as Persona) : undefined;
}

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function setLeadReviewStatusAction(formData: FormData) {
  await requireOperator();

  const recordId = str(formData, "recordId");
  const decision = str(formData, "decision"); // "confirm" | "dismiss"
  if (!recordId || (decision !== "confirm" && decision !== "dismiss")) {
    redirect("/crm/leads?action=crm-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect(`/crm/leads/${recordId}?action=not-configured`);
  }

  const reviewStatus = decision === "confirm" ? "active" : "dismissed";
  const supabase = getSupabaseAdminClient();
  const orgId = await getCurrentOrgId();
  const { error } = await supabase
    .from("leads")
    .update({ review_status: reviewStatus } as TablesUpdate<"leads">)
    .eq("id", recordId)
    .eq("org_id", orgId);
  if (error) {
    redirect(`/crm/leads/${recordId}?action=crm-error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/crm/leads/${recordId}`);
  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${recordId}?action=${decision === "confirm" ? "lead-confirmed" : "lead-dismissed"}`);
}
