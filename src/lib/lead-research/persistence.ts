import { type ParsedLeadResearchInput } from "@/domain";
import { insertActivity } from "@/lib/interactions/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type LeadResearchScope = { orgId: string; workspaceId?: string };

export type PersistLeadResearchResult =
  | { ok: true; companyId: string | null; contactIds: string[]; leadId: string; enriched: boolean }
  | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

type SupabaseClientLike = ReturnType<typeof getSupabaseAdminClient>;

/** Build a patch of only the columns that are currently blank on the existing row. */
function blankOnlyPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, string | null>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const current = existing[key];
    if (value != null && (current == null || current === "")) {
      patch[key] = value;
    }
  }
  return patch;
}

export async function persistLeadResearch(
  input: ParsedLeadResearchInput,
  scope: LeadResearchScope,
): Promise<PersistLeadResearchResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const supabase = getSupabaseAdminClient();
  const orgId = scope.orgId;
  const provenance = { source: "arc_research", evidence: input.evidence, confidence: input.confidence };

  try {
    let enriched = false;

    // --- Company: dedup by id or (org, name); enrich blanks or insert ---
    let companyId: string | null = null;
    const existingCompany = input.existingCompanyId
      ? await fetchById(supabase, "companies", "id, website_url, phone, email", input.existingCompanyId, orgId)
      : await fetchByName(supabase, input.company.name, orgId);

    if (existingCompany) {
      companyId = existingCompany.id as string;
      const patch = blankOnlyPatch(existingCompany, {
        website_url: input.company.websiteUrl,
        phone: input.company.phone,
        email: input.company.email,
      });
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("companies").update(patch).eq("id", companyId).eq("org_id", orgId);
        if (error) return { ok: false, error: error.message };
        enriched = true;
        await logActivity(orgId, "company", companyId, "record_updated", `Arc enriched ${input.company.name}`, provenance);
      }
    } else {
      const inserted = await insertReturningId(supabase, "companies", {
        org_id: orgId,
        name: input.company.name,
        persona: input.persona,
        website_url: input.company.websiteUrl,
        phone: input.company.phone,
        email: input.company.email,
        metadata: provenance,
      });
      if (!inserted.ok) return inserted;
      companyId = inserted.id;
      await logActivity(orgId, "company", companyId, "record_created", `Arc created ${input.company.name}`, provenance);
    }

    // --- Contacts: dedup by id or (org, email|phone); enrich blanks or insert ---
    const contactIds: string[] = [];
    for (let i = 0; i < input.contacts.length; i++) {
      const contact = input.contacts[i];
      const existing =
        i === 0 && input.existingContactId
          ? await fetchById(supabase, "contacts", "id, first_name, last_name, title, email, phone", input.existingContactId, orgId)
          : await fetchContact(supabase, contact.email, contact.phone, orgId);

      const incoming = {
        first_name: contact.firstName,
        last_name: contact.lastName,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
      };

      if (existing) {
        const contactId = existing.id as string;
        const patch = blankOnlyPatch(existing, incoming);
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("contacts").update(patch).eq("id", contactId).eq("org_id", orgId);
          if (error) return { ok: false, error: error.message };
          enriched = true;
          await logActivity(orgId, "contact", contactId, "record_updated", "Arc enriched contact", provenance);
        }
        contactIds.push(contactId);
      } else {
        const inserted = await insertReturningId(supabase, "contacts", {
          org_id: orgId,
          company_id: companyId,
          persona: input.persona,
          ...incoming,
          metadata: { source: "arc_research" },
        });
        if (!inserted.ok) return inserted;
        contactIds.push(inserted.id);
        await logActivity(orgId, "contact", inserted.id, "record_created", "Arc created contact", provenance);
      }
    }

    // --- Property (optional, no dedup in v1) ---
    let propertyId: string | null = null;
    if (input.property) {
      const inserted = await insertReturningId(supabase, "properties", {
        org_id: orgId,
        company_id: companyId,
        contact_id: contactIds[0] ?? null,
        persona: input.persona,
        street_line_1: input.property.streetLine1,
        street_line_2: input.property.streetLine2,
        city: input.property.city,
        state: input.property.state,
        postal_code: input.property.postalCode,
        property_type: input.property.propertyType,
        metadata: { source: "arc_research" },
      });
      if (!inserted.ok) return inserted;
      propertyId = inserted.id;
    }

    // --- Lead (always) ---
    const leadInsert = await insertReturningId(supabase, "leads", {
      org_id: orgId,
      company_id: companyId,
      contact_id: contactIds[0] ?? null,
      property_id: propertyId,
      persona: input.persona,
      status: "needs_review",
      routing_recommendation: "target",
      source: "arc_research",
      loss_signals: [],
      lead_score: 0,
      metadata: provenance,
    });
    if (!leadInsert.ok) return leadInsert;
    await logActivity(orgId, "lead", leadInsert.id, "record_created", `Arc created research lead: ${input.company.name}`, provenance);

    return { ok: true, companyId, contactIds, leadId: leadInsert.id, enriched };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to persist research lead." };
  }
}

async function fetchById(
  supabase: SupabaseClientLike,
  table: string,
  columns: string,
  id: string,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from(table).select(columns).eq("id", id).eq("org_id", orgId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchByName(
  supabase: SupabaseClientLike,
  name: string,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, website_url, phone, email")
    .eq("org_id", orgId)
    .ilike("name", name)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchContact(
  supabase: SupabaseClientLike,
  email: string | null,
  phone: string | null,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const columns = "id, first_name, last_name, title, email, phone";
  if (email) {
    const { data } = await supabase.from("contacts").select(columns).eq("org_id", orgId).eq("email", email).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  if (phone) {
    const { data } = await supabase.from("contacts").select(columns).eq("org_id", orgId).eq("phone", phone).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  return null;
}

async function insertReturningId(
  supabase: SupabaseClientLike,
  table: string,
  values: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) return { ok: false, error: `Failed to write ${table}: ${error.message}` };
  if (!data?.id) return { ok: false, error: `Failed to write ${table}: no id returned.` };
  return { ok: true, id: data.id };
}

/**
 * Best-effort audit breadcrumb. insertActivity returns a PersistResult and does
 * not throw, so a failed activity write is intentionally non-fatal — the core
 * company/contact/lead rows are already committed and must not be rolled back
 * by an audit-log hiccup.
 */
async function logActivity(
  orgId: string,
  entityType: "company" | "contact" | "lead",
  entityId: string,
  activityType: "record_created" | "record_updated",
  summary: string,
  provenance: Record<string, unknown>,
): Promise<void> {
  await insertActivity(
    {
      entityType,
      entityId,
      activityType,
      summary,
      actorKind: "agent",
      actorName: "Arc",
      metadata: provenance,
    },
    { orgId },
  );
}
