import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

/** app_settings key holding the per-org `source` → campaign-uuid map. */
export const ATTRIBUTION_SOURCE_RULES_KEY = "attribution_source_rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Coerce a jsonb blob into the `Record<source, campaignId>` shape resolveAttribution
 * expects, dropping anything that isn't a plain string→uuid pair.
 *
 * Exported for its own tests, and kept separate from the read because the value
 * arrives from the database as unstructured jsonb: whatever wrote it (a settings
 * form, a script, psql) is not guaranteed to have written the shape this claims.
 * Casting it would let `{"Google Ads": {"campaign": "…"}}` through as a rule and
 * fail somewhere further from the cause.
 *
 * Non-uuid values are dropped here as well as in resolveAttribution. That is
 * deliberate duplication: the domain guard is what makes attribution safe, this one
 * is what makes the map legible — a rule that silently never fires is worse than
 * one that was never loaded.
 */
export function parseSourceRules(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [source, campaignId] of Object.entries(value as Record<string, unknown>)) {
    if (!source.trim()) continue;
    if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) continue;
    out[source] = campaignId;
  }
  return out;
}

/**
 * The org's declared `source` → campaign map, for lead ingest.
 *
 * Best-effort by design: attribution is enrichment, and a settings read that fails
 * must never fail a lead. An empty map means "attribute nothing by source", which is
 * exactly the behaviour before these rules existed — the lead still lands, it just
 * resolves `unattributed`, same as a lead whose source nobody has mapped.
 *
 * Returns {} for a null org rather than reading across orgs: a caller that cannot
 * name its tenant does not get to inherit another tenant's attribution rules.
 */
export async function getAttributionSourceRules(
  orgId: string | null | undefined,
  client?: SupabaseClient,
): Promise<Record<string, string>> {
  if (!orgId) return {};
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return {};

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", orgId)
      .eq("key", ATTRIBUTION_SOURCE_RULES_KEY)
      .maybeSingle<{ value: unknown }>();
    if (error || !data) return {};
    return parseSourceRules(data.value);
  } catch {
    return {};
  }
}
