import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignDraft } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

const SOURCE_SYSTEM = "operator";
const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

export type CampaignPhoto = { filename: string; contentType: string; bytes: Uint8Array };

// Injectable so persistence is unit-testable without real Supabase Storage.
export type ImageUploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export function defaultUploader(client: SupabaseClient): ImageUploader {
  return async (path, bytes, contentType) => {
    const { error } = await client.storage.from(CAMPAIGN_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`image upload failed: ${error.message}`);
    return client.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  };
}

export type CreateOperatorCampaignInput = {
  draft: ParsedCampaignDraft;
  operator: string;
  photos: CampaignPhoto[];
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

export type CreateOperatorCampaignResult = { campaignId: string; assetIds: string[] };

/**
 * Persist an operator-authored campaign + its photo assets.
 *
 * Non-transactional: this is a sequence of independent inserts (Supabase JS has no
 * multi-table transaction surface). If an insert fails after the campaign row is
 * written, a partial campaign may remain. Acceptable for this iteration — operator
 * creates are low-frequency; a cleanup/retry path can be added if it becomes a problem.
 */
export async function createOperatorCampaign({
  draft,
  operator,
  photos,
  client = getSupabaseAdminClient(),
  uploader,
}: CreateOperatorCampaignInput): Promise<CreateOperatorCampaignResult> {
  const upload = uploader ?? defaultUploader(client);
  const now = new Date().toISOString();

  const campaignId = await insertOne(client, "campaigns", {
    name: draft.name,
    persona: draft.persona,
    restoration_focus: draft.restorationFocus,
    status: "draft",
    source_system: SOURCE_SYSTEM,
    launch_locked: true,
    owner: operator,
    objective: draft.objective ?? null,
    audience_summary: draft.audienceSummary ?? null,
    offer_summary: draft.offerSummary ?? null,
    company_id: draft.companyId ?? null,
    lead_id: draft.leadId ?? null,
    source_signal: { authored_by: "operator" },
  });

  const assetIds: string[] = [];
  for (const [index, photo] of photos.entries()) {
    // Caller (the create action) is responsible for sanitizing photo.filename before
    // it reaches here — it is interpolated directly into the storage path.
    const path = `operator-campaigns/${campaignId}/${index}-${photo.filename}`;
    const url = await upload(path, photo.bytes, photo.contentType);

    const assetId = await insertOne(client, "campaign_assets", {
      campaign_id: campaignId,
      asset_type: "social_ad",
      channel: draft.channel ?? "social",
      title: `${draft.name} — photo ${index + 1}`,
      status: "approved",
      source_system: SOURCE_SYSTEM,
      approved_by: operator,
      approved_at: now,
      dispatch_locked: true,
      audit_payload: { media_assets: [{ url }], outbound_locked: true, authored_by: "operator" },
    });
    assetIds.push(assetId);

    const approvalItemId = await insertOne(client, "approval_items", {
      campaign_id: campaignId,
      campaign_asset_id: assetId,
      item_type: "campaign_asset",
      status: "approved",
      approval_required: true,
      locked_until_approved: true,
      risk_level: "low",
      requested_by: operator,
      reviewed_by: operator,
      reviewed_at: now,
    });

    await insertNoReturn(client, "approval_decisions", {
      approval_item_id: approvalItemId,
      decision: "approved",
      decided_by: operator,
      previous_status: "pending_approval",
      next_status: "approved",
      metadata: { source: "operator_create" },
    });
  }

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "created",
    actor: operator,
    detail: `Campaign authored by ${operator} with ${photos.length} photo${photos.length === 1 ? "" : "s"}.`,
    payload: { source: "operator_create", photo_count: photos.length },
  });

  return { campaignId, assetIds };
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  if (!data?.id) throw new Error(`${table} insert did not return an id.`);
  return data.id;
}

async function insertNoReturn(client: SupabaseClient, table: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await client.from(table).insert(values);
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
}
