"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CampaignDraftValidationError, parseCampaignDraft, RevisionInstructionError, validateRevisionInstruction } from "@/domain";
import { createOperatorCampaign, type CampaignPhoto } from "@/lib/campaigns/create";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { type ApprovalDecision, decideApprovalItem, decideAsset, reopenAsset } from "@/lib/campaigns/decisions";
import { deployAsset, launchCampaign } from "@/lib/campaigns/launch";
import { sendMarkDirective } from "@/lib/campaigns/mark-conversation";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

export type RevisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator asks Mark to revise a specific campaign asset. Gated by the operator
 * check + Supabase config, validated through the domain, then persisted as a
 * real revision request (outbound stays locked). Shaped for `useActionState`.
 */
export async function requestRevisionAction(
  _previous: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so Mark can't record the revision." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();

  if (!campaignId || !assetId) {
    return { ok: false, message: "Choose an asset for Mark to revise." };
  }

  let instruction: string;
  try {
    instruction = validateRevisionInstruction(formData.get("instruction"));
  } catch (error) {
    if (error instanceof RevisionInstructionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  try {
    await requestAssetRevision({ campaignId, assetId, instruction, operator: getOperatorActor() }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Mark couldn't record the revision." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: "Sent to Mark. The asset is now 'revision requested'; outbound stays locked.",
  };
}

export type DecisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator approves / declines / archives a campaign approval item. Gated, a
 * real backend state transition, and outbound stays locked. Shaped for
 * `useActionState`. The clicked submit button supplies `decision`.
 */
export async function decideApprovalAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the decision can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!approvalItemId) {
    return { ok: false, message: "Missing approval item." };
  }
  if (!DECISIONS.includes(decision as ApprovalDecision)) {
    return { ok: false, message: "Unknown decision." };
  }

  try {
    await decideApprovalItem(
      { approvalItemId, decision: decision as ApprovalDecision, operator: getOperatorActor(), notes },
      getSupabaseAdminClient(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the decision." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  if (decision === "approved") {
    return { ok: true, message: "Deliverable approved. Launch the campaign when every piece is ready." };
  }
  if (decision === "declined") {
    return { ok: true, message: "Sent back for rework. This piece stays out of the launch." };
  }
  return { ok: true, message: "Removed from the queue." };
}

/**
 * Decide a deliverable by its asset id. Works whether or not Mark attached an
 * approval gate, so every piece is decidable. Shaped for `useActionState`; the
 * clicked submit button supplies `decision`.
 */
export async function decideAssetAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the decision can't be recorded." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!assetId) {
    return { ok: false, message: "Missing deliverable." };
  }
  if (!DECISIONS.includes(decision as ApprovalDecision)) {
    return { ok: false, message: "Unknown decision." };
  }

  try {
    await decideAsset({ assetId, campaignId, decision: decision as ApprovalDecision, operator: getOperatorActor(), notes }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the decision." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  if (decision === "approved") {
    return { ok: true, message: "Approved. Deploy it now, or launch with the campaign." };
  }
  if (decision === "declined") {
    return { ok: true, message: "Sent back for rework. This piece stays out of the launch." };
  }
  return { ok: true, message: "Removed from the queue." };
}

/**
 * Send a decided / deployed / removed deliverable back to the review queue —
 * the change-your-mind path. Re-locks dispatch. Shaped for `useActionState`.
 */
export async function reopenAssetAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the piece can't be re-opened." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!assetId) {
    return { ok: false, message: "Missing deliverable." };
  }

  try {
    await reopenAsset({ assetId, campaignId, operator: getOperatorActor() }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't re-open the piece." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return { ok: true, message: "Back in the review queue — dispatch re-locked." };
}

export type MarkMessageActionState = { ok: boolean; message: string } | null;

const MAX_MARK_MESSAGE = 2000;

/**
 * Operator sends Mark a message for a campaign. Records it as a durable queued
 * directive (agent_task) for Hermes — no live AI call. Shaped for
 * `useActionState`.
 */
export async function sendMarkMessageAction(
  _previous: MarkMessageActionState,
  formData: FormData,
): Promise<MarkMessageActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so Mark can't receive the message." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!campaignId) {
    return { ok: false, message: "Missing campaign." };
  }
  if (!message) {
    return { ok: false, message: "Write a message for Mark first." };
  }
  if (message.length > MAX_MARK_MESSAGE) {
    return { ok: false, message: `Keep it under ${MAX_MARK_MESSAGE} characters.` };
  }

  try {
    await sendMarkDirective({ campaignId, message, operator: getOperatorActor() }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't send the message to Mark." };
  }

  revalidatePath(`/campaigns/${campaignId}`);

  return { ok: true, message: "Sent to Mark — queued. His reply lands here when he's done." };
}

export type LaunchActionState = { ok: boolean; message: string } | null;

/**
 * Deploy a single approved deliverable ahead of the full campaign. Unlocks that
 * one piece and records a handoff event for Mark. Shaped for `useActionState`.
 */
export async function deployAssetAction(
  _previous: LaunchActionState,
  formData: FormData,
): Promise<LaunchActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the piece can't be deployed." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!assetId) {
    return { ok: false, message: "Missing deliverable." };
  }

  try {
    await deployAsset({ campaignId, assetId, operator: getOperatorActor() }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't deploy the piece." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return { ok: true, message: "Deployed — handed off to Mark for dispatch." };
}

/**
 * Operator launches a campaign once its pieces are approved. A real backend
 * state transition (campaign → live, approved deliverables unlocked) plus a
 * `campaign_launched` handoff event for Mark/Hermes to execute the sends. The
 * app records state and hands off; it does not send anything itself.
 */
export async function launchCampaignAction(
  _previous: LaunchActionState,
  formData: FormData,
): Promise<LaunchActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the campaign can't be launched." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) {
    return { ok: false, message: "Missing campaign." };
  }

  let launchedAssets = 0;
  try {
    ({ launchedAssets } = await launchCampaign({ campaignId, operator: getOperatorActor() }, getSupabaseAdminClient()));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't launch the campaign." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: `Campaign launched — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed off to Mark for dispatch.`,
  };
}

export type CreateCampaignActionState = { ok: boolean; message: string } | null;

/**
 * Operator authors a campaign by hand: validate the draft, upload any photos to the
 * campaign-media bucket, persist a draft campaign with approved photo assets, then
 * redirect to the new campaign. Gated by the operator check + Supabase config.
 * Shaped for `useActionState`.
 */
export async function createCampaignAction(
  _previous: CreateCampaignActionState,
  formData: FormData,
): Promise<CreateCampaignActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the campaign can't be saved." };
  }

  let draft;
  try {
    draft = parseCampaignDraft({
      name: formData.get("name"),
      persona: formData.get("persona"),
      restorationFocus: formData.get("restorationFocus"),
      channel: formData.get("channel"),
      audienceSummary: formData.get("audienceSummary"),
      objective: formData.get("objective"),
      offerSummary: formData.get("offerSummary"),
    });
  } catch (error) {
    if (error instanceof CampaignDraftValidationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  let photos: CampaignPhoto[];
  try {
    photos = await readPhotos(formData);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't read the uploaded photos." };
  }

  let campaignId: string;
  try {
    const result = await createOperatorCampaign({
      draft,
      operator: getOperatorActor(),
      photos,
      client: getSupabaseAdminClient(),
    });
    campaignId = result.campaignId;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't create the campaign." };
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB per file

async function readPhotos(formData: FormData): Promise<CampaignPhoto[]> {
  const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const photos: CampaignPhoto[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error(`"${file.name}" isn't an image.`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`"${file.name}" is larger than 10 MB.`);
    }
    photos.push({
      filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return photos;
}
