"use server";

import { revalidatePath } from "next/cache";

import { isSharePermission, isShareVisibility, type SharePermission, type ShareVisibility } from "@/domain";
import {
  assertCampaignAccess,
  listCampaignShares,
  setCampaignVisibility,
  shareCampaign,
  unshareCampaign,
} from "@/lib/campaigns/sharing";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Campaign sharing actions — the same shape as chat sharing, over the campaign
 * access backend (src/lib/campaigns/sharing.ts). Campaigns are workspace-visible
 * by default; these let an owner/collaborator restrict to private or share with
 * specific members. Gated by requireOperator + assertCampaignAccess("collaborate").
 */

export type ShareActionResult = { ok: true } | { ok: false; error: string };
const NO_BACKEND: ShareActionResult = { ok: false, error: "Sharing needs a connected backend." };

export async function setCampaignSharingAction(input: {
  campaignId: string;
  visibility: ShareVisibility;
  workspacePermission: SharePermission;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  if (!isShareVisibility(input.visibility) || !isSharePermission(input.workspacePermission)) {
    return { ok: false, error: "Invalid sharing settings." };
  }
  try {
    await assertCampaignAccess(input.campaignId, "collaborate");
    await setCampaignVisibility(input.campaignId, input.visibility, input.workspacePermission);
    revalidatePath(`/campaigns/${input.campaignId}`);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't update sharing." };
  }
}

export async function shareCampaignWithMemberAction(input: {
  campaignId: string;
  userId: string;
  permission: SharePermission;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  if (!input.userId.trim() || !isSharePermission(input.permission)) {
    return { ok: false, error: "Pick a member and a permission." };
  }
  try {
    await assertCampaignAccess(input.campaignId, "collaborate");
    const me = await getSupabaseAuthenticatedUser().catch(() => null);
    await shareCampaign(input.campaignId, input.userId, input.permission, me?.id ?? null);
    revalidatePath(`/campaigns/${input.campaignId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't share the campaign." };
  }
}

export async function unshareCampaignMemberAction(input: {
  campaignId: string;
  userId: string;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  try {
    await assertCampaignAccess(input.campaignId, "collaborate");
    await unshareCampaign(input.campaignId, input.userId);
    revalidatePath(`/campaigns/${input.campaignId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't remove access." };
  }
}

export type ShareMember = { userId: string; email: string | null; permission: SharePermission | null };
export type CampaignSharingState = {
  visibility: ShareVisibility;
  workspacePermission: SharePermission;
  shared: ShareMember[];
  addable: ShareMember[];
};

/** Everything the campaign share dialog needs in one call. Defaults offline. */
export async function getCampaignSharingStateAction(campaignId: string): Promise<CampaignSharingState> {
  const fallback: CampaignSharingState = { visibility: "workspace", workspacePermission: "collaborate", shared: [], addable: [] };
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return fallback;
  try {
    await assertCampaignAccess(campaignId, "view");
    const client = getSupabaseAdminClient();
    const { data: campaign } = await client
      .from("campaigns")
      .select("owner_id,visibility,workspace_permission")
      .eq("id", campaignId)
      .maybeSingle<{ owner_id: string | null; visibility: ShareVisibility; workspace_permission: SharePermission }>();
    if (!campaign) return fallback;
    const ctx = await getCurrentWorkspaceContext().catch(() => null);
    const shares = await listCampaignShares(campaignId, client);
    const sharedUserIds = new Set(shares.map((s) => s.userId));
    const team = ctx?.workspaceId ? await listWorkspaceTeamAccess(ctx.workspaceId) : null;
    const members = team && team.ok ? team.members : [];
    const emailByUser = new Map(members.filter((m) => m.userId).map((m) => [m.userId as string, m.email]));
    return {
      visibility: campaign.visibility,
      workspacePermission: campaign.workspace_permission,
      shared: shares.map((s) => ({ userId: s.userId, email: emailByUser.get(s.userId) ?? null, permission: s.permission })),
      addable: members
        .filter((m) => m.userId && m.userId !== campaign.owner_id && !sharedUserIds.has(m.userId))
        .map((m) => ({ userId: m.userId as string, email: m.email, permission: null })),
    };
  } catch {
    return fallback;
  }
}
