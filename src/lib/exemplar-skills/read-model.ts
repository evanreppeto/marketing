/**
 * Read the campaign history an exemplar skill is generated from.
 *
 * Org-scoped throughout: every query filters on `org_id`, and the entry point
 * refuses without one rather than falling back to "all workspaces". A generator
 * that quietly spanned tenants would bake one workspace's voice into another's
 * skill file — the same hidden-default shape that has bitten this codebase
 * before, and worse here because the output is a durable artifact.
 */

import { type SupabaseClient } from "@supabase/supabase-js";

import { type ExemplarCandidate } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import {
  groupByAssetId,
  shapeCandidates,
  type CampaignAssetRow,
  type CampaignEventRow,
  type CampaignPersonaRow,
  type CampaignResultRow,
  type EngagementEventRow,
} from "./shape";

export type ExemplarCandidateData =
  | { status: "live"; candidates: ExemplarCandidate[] }
  | { status: "unavailable"; message: string };

/**
 * Cap on assets pulled per generation. Selection only keeps a handful, so this
 * bounds the join without changing the result in any realistic workspace.
 */
export const MAX_CANDIDATE_ASSETS = 500;

const ASSET_COLUMNS =
  "id,campaign_id,asset_type,channel,title,status,draft_body,edited_body,approved_body,approved_at,edited_fields";

/**
 * Fetch and shape every campaign asset in the org that could serve as an
 * exemplar, with its approval history, results, and engagement attached.
 */
export async function getExemplarCandidates(
  orgId: string | null | undefined,
  client?: SupabaseClient,
): Promise<ExemplarCandidateData> {
  if (!orgId) {
    return { status: "unavailable", message: "A workspace is required to generate an exemplar skill." };
  }
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const { data: assetData, error: assetError } = await supabase
      .from("campaign_assets")
      .select(ASSET_COLUMNS)
      .eq("org_id", orgId)
      .order("approved_at", { ascending: false })
      .limit(MAX_CANDIDATE_ASSETS);
    if (assetError) throw new Error(`campaign_assets: ${assetError.message}`);

    const assets = (assetData ?? []) as CampaignAssetRow[];
    if (assets.length === 0) return { status: "live", candidates: [] };

    const assetIds = assets.map((asset) => asset.id);
    const campaignIds = [...new Set(assets.map((asset) => asset.campaign_id).filter(Boolean))];

    const [campaigns, events, results, engagement] = await Promise.all([
      selectRows<CampaignPersonaRow>(supabase, "campaigns", "id,persona", orgId, "id", campaignIds),
      selectRows<CampaignEventRow>(
        supabase,
        "campaign_events",
        "campaign_asset_id,event_type,payload",
        orgId,
        "campaign_asset_id",
        assetIds,
      ),
      selectRows<CampaignResultRow>(
        supabase,
        "campaign_results",
        "campaign_asset_id,impressions,clicks,leads,jobs,won_revenue_cents,spend_cents",
        orgId,
        "campaign_asset_id",
        assetIds,
      ),
      selectRows<EngagementEventRow>(
        supabase,
        "engagement_events",
        "campaign_asset_id,event_type",
        orgId,
        "campaign_asset_id",
        assetIds,
      ),
    ]);

    const personaByCampaignId = new Map<string, string | null>();
    for (const campaign of campaigns) personaByCampaignId.set(campaign.id, campaign.persona ?? null);

    return {
      status: "live",
      candidates: shapeCandidates({
        assets,
        personaByCampaignId,
        eventsByAssetId: groupByAssetId(events),
        resultsByAssetId: groupByAssetId(results),
        engagementByAssetId: groupByAssetId(engagement),
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Campaign history is unavailable.",
    };
  }
}

async function selectRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  orgId: string,
  inColumn: string,
  inValues: string[],
): Promise<T[]> {
  if (inValues.length === 0) return [];
  const { data, error } = await client.from(table).select(columns).eq("org_id", orgId).in(inColumn, inValues);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}
