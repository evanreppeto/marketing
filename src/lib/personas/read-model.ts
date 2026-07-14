import { type SupabaseClient } from "@supabase/supabase-js";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * The persona keys an org may tag records with — its active `personas.slug`
 * values. This is the per-org replacement for the retired `persona_mapping`
 * enum (migration 20260713120000): lead ingestion and Arc record writes validate
 * against it instead of BSR's fixed 12.
 *
 * Offline / no Supabase: returns the BSR demo set only in demo mode, otherwise an
 * empty list, so a real but misconfigured deployment fails closed rather than
 * silently accepting restoration personas. An org with no active personas
 * likewise returns `[]` — new workspaces are seeded a neutral starter set at
 * onboarding, so this only bites orgs that have deleted every persona.
 */
export async function getOrgPersonaKeys(orgId?: string): Promise<string[]> {
  if (!isSupabaseAdminConfigured()) {
    return isDemoDataEnabled() ? [...OFFICIAL_PERSONA_MAPPINGS] : [];
  }
  try {
    const resolvedOrgId = orgId ?? (await getCurrentOrgId());
    // `personas` isn't in the generated types yet — use an untyped client.
    const supabase = getSupabaseAdminClient() as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("personas")
      .select("slug")
      .eq("org_id", resolvedOrgId)
      .eq("is_active", true);
    if (error) throw error;
    return expandLegacyPersonaKeys((data as { slug: string }[] | null)?.map((row) => row.slug) ?? []);
  } catch {
    return isDemoDataEnabled() ? [...OFFICIAL_PERSONA_MAPPINGS] : [];
  }
}

export type PersonaOption = { key: string; label: string };

/**
 * Persona dropdown options for the current org — active personas as
 * `{ key: slug, label: name }`, name-sorted. Returns `[]` when Supabase isn't
 * configured or the org has none; UI pickers fall back to the BSR demo set in
 * that case so offline/demo previews still render a populated dropdown.
 */
export async function getOrgPersonaOptions(orgId?: string): Promise<PersonaOption[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const resolvedOrgId = orgId ?? (await getCurrentOrgId());
    const supabase = getSupabaseAdminClient() as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("personas")
      .select("slug,name")
      .eq("org_id", resolvedOrgId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data as { slug: string; name: string }[] | null)?.map((row) => ({ key: row.slug, label: row.name })) ?? [];
  } catch {
    return [];
  }
}

/**
 * Transitional bridge: for a new org, `personas.slug` IS the key records are
 * tagged with. But BSR-era data + integrations use the legacy `persona_`-prefixed
 * enum form (e.g. `persona_homeowner_emergency`) while its console slug is kebab
 * (`homeowner-emergency`). Accepting both keeps legacy ingestion working without
 * biasing new tenants (the extra prefixed key is simply never sent). Drop this
 * once demo data is normalized to slug-based keys.
 */
function expandLegacyPersonaKeys(slugs: string[]): string[] {
  const keys = new Set<string>();
  for (const slug of slugs) {
    keys.add(slug);
    if (!slug.startsWith("persona_")) keys.add(`persona_${slug.replace(/-/g, "_")}`);
  }
  return [...keys];
}
