import { type SupabaseClient } from "@supabase/supabase-js";

import { aggregateBySlice, type ResultRow, type SliceDimension, type SliceStat } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type SliceFilter = { dimension?: SliceDimension; days?: number; persona?: string; channel?: string };

/** PostgREST returns an embedded relation as an object (to-one) or array (to-many); normalize to one. */
function embedOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

/**
 * Aggregate campaign_results (joined to campaign persona + asset type/channel)
 * into "what's working" slices. Empty when Supabase isn't configured.
 */
export async function getPerformanceBySlice(
  filter: SliceFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ dimension: SliceDimension; slices: SliceStat[] }> {
  const dimension: SliceDimension = filter.dimension ?? "persona";
  if (!isSupabaseAdminConfigured()) return { dimension, slices: [] };

  const days = filter.days ?? 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await client
    .from("campaign_results")
    .select(
      "channel, impressions, clicks, leads, jobs, won_revenue_cents, spend_cents, period_end, campaigns(persona), campaign_assets(asset_type, channel)",
    )
    .gte("period_end", since);
  if (error || !data) return { dimension, slices: [] };

  const rows: ResultRow[] = (data as unknown as Array<Record<string, unknown>>).map((r) => {
    const campaign = embedOne<{ persona?: string | null }>(r.campaigns) ?? {};
    const asset = embedOne<{ asset_type?: string | null; channel?: string | null }>(r.campaign_assets) ?? {};
    return {
      persona: campaign.persona ?? null,
      channel: (r.channel as string | null) ?? asset.channel ?? null,
      assetType: asset.asset_type ?? null,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      leads: Number(r.leads ?? 0),
      jobs: Number(r.jobs ?? 0),
      wonRevenueCents: Number(r.won_revenue_cents ?? 0),
      spendCents: Number(r.spend_cents ?? 0),
    };
  });

  const filtered = rows.filter(
    (row) => (!filter.persona || row.persona === filter.persona) && (!filter.channel || row.channel === filter.channel),
  );
  return { dimension, slices: aggregateBySlice(filtered, dimension) };
}
