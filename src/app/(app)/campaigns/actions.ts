"use server";

import { revalidatePath } from "next/cache";

import { isAllowedPersona } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { createCampaignShell } from "@/lib/campaigns/create";
import { getOrgPersonaKeys } from "@/lib/personas/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Real operator write for the "New campaign" button. Creates a draft,
 * launch-locked campaign shell (createCampaignShell) — the operator/Arc then
 * builds it out on the detail page. Nothing goes outbound: the row is
 * launch_locked and approval-gated. `persisted: false` is the honest offline
 * signal so the board can show an optimistic draft without claiming a save.
 */
export type CreateCampaignResult =
  | { ok: true; persisted: boolean; campaignId?: string; href?: string }
  | { ok: false; error: string };

export type NewCampaignInput = { name: string; persona: string; campaignTheme: string };

export async function createCampaign(input: NewCampaignInput): Promise<CreateCampaignResult> {
  await requireOperator();

  const name = input.name?.trim();
  const persona = input.persona?.trim();
  const campaignTheme = input.campaignTheme?.trim();
  if (!name) return { ok: false, error: "A campaign name is required." };
  if (!persona) return { ok: false, error: "Choose a persona for this campaign." };
  if (!campaignTheme || campaignTheme.length > 120) return { ok: false, error: "Add a campaign theme (120 characters or fewer)." };

  const actor = await getOperatorActor();

  // Offline/demo: no DB to write to. Report success-but-unpersisted so the board
  // can show an optimistic draft without claiming it saved.
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!isAllowedPersona(persona, await getOrgPersonaKeys(ctx.orgId))) {
    return { ok: false, error: "Choose a persona for this campaign." };
  }
  try {
    const { campaignId } = await createCampaignShell({
      operator: actor,
      name,
      persona,
      campaignTheme,
      tenant: { org_id: ctx.orgId, workspace_id: ctx.workspaceId ?? "" },
    });
    revalidatePath("/campaigns");
    return { ok: true, persisted: true, campaignId, href: `/campaigns/${campaignId}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the campaign." };
  }
}
