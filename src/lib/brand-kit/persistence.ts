import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  parseBusinessProfile,
  type BusinessProfile,
  type PersonaDefinition,
} from "@/domain";

/** Read the Brand Kit for an org, or null if none exists / Supabase unconfigured. */
export async function getBusinessProfile(orgId: string): Promise<BusinessProfile | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) throw new Error(`Failed to read business profile: ${error.message}`);
  return data ? parseBusinessProfile(data) : null;
}

/** Insert or update the Brand Kit for an org. Returns the persisted profile. */
export async function upsertBusinessProfile(
  orgId: string,
  profile: BusinessProfile,
): Promise<BusinessProfile> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase is not configured; cannot persist business profile.");
  }
  const supabase = getSupabaseAdminClient();
  const row = {
    org_id: orgId,
    display_name: profile.displayName,
    legal_name: profile.legalName,
    tagline: profile.tagline,
    description: profile.description,
    industry: profile.industry,
    website_url: profile.websiteUrl,
    logo_url: profile.logoUrl,
    favicon_url: profile.faviconUrl,
    short_mark: profile.shortMark,
    service_areas: profile.serviceAreas as never,
    time_zone: profile.timeZone,
    accent: profile.accent,
    density: profile.density,
    motion: profile.motion,
    tone: profile.tone,
    voice_guidance: profile.voiceGuidance,
    preferred_phrases: profile.preferredPhrases as never,
    banned_phrases: profile.bannedPhrases as never,
    services: profile.services as never,
    proof_points: profile.proofPoints as never,
    guardrails: profile.guardrails as never,
    status: profile.status,
  };
  const { data, error } = await supabase
    .from("business_profiles")
    .upsert(row, { onConflict: "org_id" })
    .select("*")
    .single<Record<string, unknown>>();
  if (error) throw new Error(`Failed to upsert business profile: ${error.message}`);
  return parseBusinessProfile(data);
}

/** List an org's persona definitions, sorted by sort_order. Empty if unconfigured. */
export async function listPersonaDefinitions(orgId: string): Promise<PersonaDefinition[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("persona_definitions")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to list persona definitions: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    key: String(r.key),
    label: String(r.label),
    audienceType: String(r.audience_type ?? "customer"),
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    isActive: r.is_active !== false,
    metadata: (r.metadata ?? {}) as PersonaDefinition["metadata"],
  }));
}
