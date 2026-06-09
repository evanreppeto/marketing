import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignEdit } from "@/domain";

import { defaultUploader, insertNoReturn, insertPhotoAsset, type CampaignPhoto, type ImageUploader } from "./create";
import { getSupabaseAdminClient } from "../supabase/server";

type CampaignGuardRow = { id: string; source_system: string | null; launch_locked: boolean };

/** Load a campaign and assert it is operator-authored and still a draft (not launched). Throws otherwise. */
async function assertOperatorDraft(client: SupabaseClient, campaignId: string): Promise<void> {
  const { data, error } = await client
    .from("campaigns")
    .select("id,source_system,launch_locked")
    .eq("id", campaignId)
    .maybeSingle<CampaignGuardRow>();
  if (error) throw new Error(`campaigns lookup failed: ${error.message}`);
  if (!data) throw new Error("Campaign not found.");
  if (data.source_system !== "operator") throw new Error("Only operator-authored campaigns can be edited here.");
  if (!data.launch_locked) throw new Error("This campaign is already live — editing is locked.");
}

export type AddCampaignPhotosInput = {
  campaignId: string;
  operator: string;
  photos: CampaignPhoto[];
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

export async function addCampaignPhotos({
  campaignId,
  operator,
  photos,
  client = getSupabaseAdminClient(),
  uploader,
}: AddCampaignPhotosInput): Promise<{ assetIds: string[] }> {
  await assertOperatorDraft(client, campaignId);
  if (photos.length === 0) return { assetIds: [] };

  const upload = uploader ?? defaultUploader(client);
  const now = new Date().toISOString();

  // Continue indices past existing assets so storage paths don't collide. A
  // non-single select returns an array in Supabase; guard defensively.
  const { data: existing, error } = await client.from("campaign_assets").select("id").eq("campaign_id", campaignId);
  if (error) throw new Error(`campaign_assets lookup failed: ${error.message}`);
  const start = Array.isArray(existing) ? existing.length : 0;

  const assetIds: string[] = [];
  for (const [i, photo] of photos.entries()) {
    assetIds.push(await insertPhotoAsset({ client, campaignId, operator, photo, index: start + i, channel: "social", uploader: upload, now }));
  }

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "asset_generated",
    actor: operator,
    detail: `${operator} added ${photos.length} photo${photos.length === 1 ? "" : "s"}.`,
    payload: { source: "operator_add_photos", photo_count: photos.length },
  });

  return { assetIds };
}

export type UpdateOperatorCampaignInput = {
  campaignId: string;
  operator: string;
  fields: ParsedCampaignEdit;
  client?: SupabaseClient;
};

export async function updateOperatorCampaign({
  campaignId,
  operator,
  fields,
  client = getSupabaseAdminClient(),
}: UpdateOperatorCampaignInput): Promise<{ campaignId: string }> {
  await assertOperatorDraft(client, campaignId);

  const { error } = await client
    .from("campaigns")
    .update({
      name: fields.name,
      audience_summary: fields.audienceSummary ?? null,
      objective: fields.objective ?? null,
      offer_summary: fields.offerSummary ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (error) throw new Error(`campaigns update failed: ${error.message}`);

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "planned",
    actor: operator,
    detail: `${operator} edited the campaign.`,
    payload: { source: "operator_edit" },
  });

  return { campaignId };
}
