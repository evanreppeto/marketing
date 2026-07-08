import { type SupabaseClient } from "@supabase/supabase-js";

import {
  type AccessDecision,
  type SharePermission,
  type ShareVisibility,
  hasRequiredPermission,
  resolveResourceAccess,
} from "@/domain";

import { ArcAccessError, getShareViewer, type ShareViewer } from "@/lib/arc-chat/sharing";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Campaign sharing — mirrors arc-chat/sharing.ts, reusing the resource-agnostic
// resolveResourceAccess. Campaigns are a shared workspace asset (visibility defaults
// to 'workspace'), so by default everyone in the workspace can collaborate; owners
// can restrict to 'private' or share with specific members. Enforced only in
// supabase auth mode (getShareViewer.enforce is false in open/dev mode).

const FULL_ACCESS: AccessDecision = Object.freeze({ canView: true, permission: "collaborate" });

type CampaignShareRowRaw = { owner_id: string | null; workspace_id: string | null; visibility: ShareVisibility; workspace_permission: SharePermission };

async function getCampaignShare(
  campaignId: string,
  userId: string,
  client: SupabaseClient,
): Promise<SharePermission | null> {
  const { data } = await client
    .from("campaign_shares")
    .select("permission")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle<{ permission: SharePermission }>();
  return data?.permission ?? null;
}

export async function resolveCampaignAccess(
  campaignId: string,
  viewer: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  if (!viewer.enforce) return FULL_ACCESS;
  const { data } = await client
    .from("campaigns")
    .select("owner_id,workspace_id,visibility,workspace_permission")
    .eq("id", campaignId)
    .maybeSingle<CampaignShareRowRaw>();
  if (!data) return { canView: false, permission: null };
  const directShare = viewer.userId ? await getCampaignShare(campaignId, viewer.userId, client) : null;
  return resolveResourceAccess(
    {
      ownerId: data.owner_id,
      workspaceId: data.workspace_id,
      visibility: data.visibility,
      workspacePermission: data.workspace_permission,
    },
    {
      userId: viewer.userId,
      isWorkspaceMember: !!data.workspace_id && viewer.workspaceIds.includes(data.workspace_id),
      directShare,
      inheritedShare: null,
    },
  );
}

export async function assertCampaignAccess(
  campaignId: string,
  required: SharePermission,
  viewer?: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  const resolvedViewer = viewer ?? (await getShareViewer(client));
  const decision = await resolveCampaignAccess(campaignId, resolvedViewer, client);
  if (!hasRequiredPermission(decision, required)) {
    throw new ArcAccessError("You don't have access to this campaign.");
  }
  return decision;
}

export async function setCampaignVisibility(
  campaignId: string,
  visibility: ShareVisibility,
  workspacePermission: SharePermission,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("campaigns")
    .update({ visibility, workspace_permission: workspacePermission })
    .eq("id", campaignId);
  if (error) throw new Error(`campaigns visibility update failed: ${error.message}`);
}

export async function shareCampaign(
  campaignId: string,
  userId: string,
  permission: SharePermission,
  sharedBy: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("campaign_shares")
    .upsert(
      { campaign_id: campaignId, user_id: userId, permission, shared_by: sharedBy },
      { onConflict: "campaign_id,user_id" },
    );
  if (error) throw new Error(`campaign_shares upsert failed: ${error.message}`);
}

export async function unshareCampaign(
  campaignId: string,
  userId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("campaign_shares")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) throw new Error(`campaign_shares delete failed: ${error.message}`);
}

export type CampaignShareRow = { userId: string; permission: SharePermission };

export async function listCampaignShares(
  campaignId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CampaignShareRow[]> {
  const { data, error } = await client
    .from("campaign_shares")
    .select("user_id,permission")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`campaign_shares list failed: ${error.message}`);
  return ((data ?? []) as { user_id: string; permission: SharePermission }[]).map((row) => ({
    userId: row.user_id,
    permission: row.permission,
  }));
}
