import { summarizeCampaignAudience, type AudienceContact, type CampaignAudienceSummary } from "@/domain";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type CampaignAudience =
  | ({ status: "resolved" } & CampaignAudienceSummary)
  | { status: "unavailable" };

/**
 * Resolve the concrete recipients a campaign would reach: the workspace contacts
 * that match the campaign's target persona and have a usable email. Read-only —
 * this powers the approval-time send preview and never sends anything.
 */
export async function resolveCampaignAudience(campaignId: string, orgId: string): Promise<CampaignAudience> {
  if (!isSupabaseAdminConfigured()) return { status: "unavailable" };
  const admin = getSupabaseAdminClient();

  // Read the raw persona_mapping value straight from the row — the detail
  // view-model humanizes persona for display ("Property manager"), which would
  // never match the contacts.persona enum ("persona_property_manager").
  const { data: campaign } = await admin
    .from("campaigns")
    .select("persona")
    .eq("id", campaignId)
    .maybeSingle<{ persona: string }>();
  const persona = campaign?.persona;
  if (!persona) return { status: "unavailable" };

  const { data: contacts } = await admin
    .from("contacts")
    .select("id, full_name, email, status")
    .eq("org_id", orgId)
    .eq("persona", persona as PersonaMapping)
    .order("updated_at", { ascending: false });

  const rows: AudienceContact[] = (
    (contacts ?? []) as { id: string; full_name: string | null; email: string | null; status: string }[]
  ).map((c) => ({
    id: String(c.id),
    name: (c.full_name ?? "").trim() || "Unnamed contact",
    email: c.email,
    status: String(c.status),
  }));

  return { status: "resolved", ...summarizeCampaignAudience(persona, rows) };
}
