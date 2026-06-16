import { type SupabaseClient } from "@supabase/supabase-js";

import { parseArcSocialAdRequest } from "./social-ad-contract";
import { getSupabaseAdminClient } from "../supabase/server";

const sourceSystem = "arc_agent_orchestrator";
const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

export type ArcSocialAdResult = {
  runId: string;
  campaignId: string;
  campaignAssetIds: string[];
  approvalItemIds: string[];
  status: "needs_approval";
};

// Uploads image bytes and returns a public URL the app can embed. Injectable so the
// orchestrator can be unit-tested without real Supabase Storage.
export type ImageUploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;

function defaultUploader(client: SupabaseClient): ImageUploader {
  return async (path, bytes, contentType) => {
    const { error } = await client.storage.from(CAMPAIGN_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) {
      throw new Error(`image upload failed: ${error.message}`);
    }
    return client.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  };
}

export async function runArcSocialAd(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
  upload: ImageUploader = defaultUploader(client),
): Promise<ArcSocialAdResult> {
  const req = parseArcSocialAdRequest(input);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const campaignId = await insertOne(client, "campaigns", {
    name: `${req.name} ${runId}`,
    persona: req.persona,
    restoration_focus: req.restorationFocus,
    status: "pending_approval",
    company_id: null,
    contact_id: null,
    lead_id: null,
    owner: req.operator,
    objective: req.objective,
    source_system: sourceSystem,
    external_campaign_id: `arc-agent-socialad-${runId}`,
    launch_locked: true,
    campaign_phase: req.restorationFocus === "storm_surge" ? "storm_triggered" : "evergreen",
    source_signal: { run_id: runId, source_campaign_id: req.sourceCampaignId ?? null },
    reasoning_payload: {},
    audit_payload: { provider: "social_ad_ingest", outbound_locked: true },
  });

  const campaignAssetIds: string[] = [];
  const approvalItemIds: string[] = [];

  for (const [index, asset] of req.assets.entries()) {
    const title = asset.format ? `${req.name} — ${asset.format}` : req.name;
    const bytes = Uint8Array.from(Buffer.from(asset.imageBase64, "base64"));
    const path = `social-ads/${runId}/${index}-${asset.format ?? "image"}.png`;
    const imageUrl = await upload(path, bytes, "image/png");

    const campaignAssetId = await insertOne(client, "campaign_assets", {
      campaign_id: campaignId,
      asset_type: "social_ad",
      channel: "social",
      title,
      status: "pending_owner_approval",
      source_system: sourceSystem,
      external_asset_id: `arc-agent-socialad-${runId}-${index}`,
      tool_source: "Arc Social Ad Ingest",
      prompt_inputs: {
        format: asset.format ?? null,
        headline: req.headline ?? null,
        body: req.body ?? null,
        cta_label: req.ctaLabel ?? null,
        cta_phone: req.ctaPhone ?? null,
      },
      draft_body: req.body ?? null,
      dispatch_locked: true,
      reasoning_payload: {},
      audit_payload: {
        run_id: runId,
        media_assets: [{
          url: imageUrl,
          type: "ad",
          title,
          description: req.headline ?? null,
          thumbnail_url: imageUrl,
        }],
      },
    });

    const approvalItemId = await insertOne(client, "approval_items", {
      campaign_id: campaignId,
      campaign_asset_id: campaignAssetId,
      item_type: "social_ad_campaign_asset",
      status: "pending_owner_approval",
      approval_required: true,
      locked_until_approved: true,
      prompt_inputs: {},
      draft_output: req.body ?? title,
      requested_by: "Arc Social Ad Ingest",
      risk_level: "medium",
      reasoning_payload: {},
      audit_payload: { run_id: runId, outbound_locked: true },
    });

    await insertOne(client, "campaign_events", {
      campaign_id: campaignId,
      campaign_asset_id: campaignAssetId,
      approval_item_id: approvalItemId,
      event_type: "approval_submitted",
      actor: "Arc Social Ad Ingest",
      detail: "Arc submitted a social ad deliverable for human approval.",
      payload: { run_id: runId, outbound_locked: true },
    });

    campaignAssetIds.push(campaignAssetId);
    approvalItemIds.push(approvalItemId);
  }

  await updateById(client, "campaigns", campaignId, { approval_item_id: approvalItemIds[0] });

  return { runId, campaignId, campaignAssetIds, approvalItemIds, status: "needs_approval" };
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }
  return data.id;
}

async function updateById(client: SupabaseClient, table: string, id: string, values: Record<string, unknown>) {
  const { error } = await client.from(table).update(values).eq("id", id);
  if (error) {
    throw new Error(`${table} update failed: ${error.message}`);
  }
}
