"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CampaignDraftValidationError, parseCampaignDraft, RevisionInstructionError, validateRevisionInstruction, ScheduledForError, validateScheduledFor } from "@/domain";
import { createCampaignShell, createOperatorCampaign, type CampaignPhoto } from "@/lib/campaigns/create";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { type ApprovalDecision, decideApprovalItem, decideAsset, reopenAsset } from "@/lib/campaigns/decisions";
import { deployAsset, launchCampaign } from "@/lib/campaigns/launch";
import { sendArcDirective } from "@/lib/campaigns/arc-conversation";
import { queueCampaignBuildTask, queueCampaignDirectiveTask } from "@/lib/campaigns/queue";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { attachMediaToCampaignAsset, listAttachableMedia, type AttachableMediaItem } from "@/lib/campaigns/attach-media";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getAgentName } from "@/lib/settings/agent-name";
import { assignConversationToCampaign, createConversation, insertOperatorMessage } from "@/lib/arc-chat/persistence";
import { parseBuildPrompt, deriveCampaignName } from "./build-campaign";

const DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RevisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator asks Arc to revise a specific campaign asset. Gated by the operator
 * check + Supabase config, validated through the domain, then persisted as a
 * real revision request (outbound stays locked). Shaped for `useActionState`.
 */
export async function requestRevisionAction(
  _previous: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  await requireOperator();
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: `Supabase isn't configured yet, so ${agentName} can't record the revision.` };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();

  if (!campaignId || !assetId) {
    return { ok: false, message: `Choose an asset for ${agentName} to revise.` };
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
    await requestAssetRevision({ campaignId, assetId, instruction, operator: await getOperatorActor() }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `${agentName} couldn't record the revision.` };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: `Sent to ${agentName}. The asset is now 'revision requested'; outbound stays locked.`,
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
    const tenant = await getCurrentAgentTaskTenantFields();
    await decideApprovalItem(
      { approvalItemId, decision: decision as ApprovalDecision, operator: await getOperatorActor(), notes, tenant },
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
 * Decide a deliverable by its asset id. Works whether or not Arc attached an
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
    const tenant = await getCurrentAgentTaskTenantFields();
    await decideAsset({ assetId, campaignId, decision: decision as ApprovalDecision, operator: await getOperatorActor(), notes, tenant }, getSupabaseAdminClient());
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
    const tenant = await getCurrentAgentTaskTenantFields();
    await reopenAsset({ assetId, campaignId, operator: await getOperatorActor(), tenant }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't re-open the piece." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return { ok: true, message: "Back in the review queue — dispatch re-locked." };
}

export type ArcMessageActionState = { ok: boolean; message: string } | null;

const MAX_ARC_MESSAGE = 2000;

/**
 * Operator sends Arc a message for a campaign. Records it as a durable queued
 * directive (agent_task) for Arc — no live AI call. Shaped for
 * `useActionState`.
 */
export async function sendArcMessageAction(
  _previous: ArcMessageActionState,
  formData: FormData,
): Promise<ArcMessageActionState> {
  await requireOperator();
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: `Supabase isn't configured yet, so ${agentName} can't receive the message.` };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!campaignId) {
    return { ok: false, message: "Missing campaign." };
  }
  if (!message) {
    return { ok: false, message: `Write a message for ${agentName} first.` };
  }
  if (message.length > MAX_ARC_MESSAGE) {
    return { ok: false, message: `Keep it under ${MAX_ARC_MESSAGE} characters.` };
  }

  try {
    await sendArcDirective({ campaignId, message, operator: await getOperatorActor(), agentName }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `Couldn't send the message to ${agentName}.` };
  }

  revalidatePath(`/campaigns/${campaignId}`);

  return { ok: true, message: `Sent to ${agentName} — queued. Its reply lands here when it's done.` };
}

export type LaunchActionState = { ok: boolean; message: string } | null;

/**
 * Deploy a single approved deliverable ahead of the full campaign. Unlocks that
 * one piece and records a handoff event for Arc. Shaped for `useActionState`.
 */
export async function deployAssetAction(
  _previous: LaunchActionState,
  formData: FormData,
): Promise<LaunchActionState> {
  await requireOperator();
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the piece can't be deployed." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!assetId) {
    return { ok: false, message: "Missing deliverable." };
  }

  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | undefined;
  if (scheduledForRaw) {
    try {
      scheduledFor = validateScheduledFor(scheduledForRaw, new Date());
    } catch (error) {
      if (error instanceof ScheduledForError) return { ok: false, message: error.message };
      throw error;
    }
  }

  try {
    const tenant = await getCurrentAgentTaskTenantFields();
    await deployAsset({ campaignId, assetId, operator: await getOperatorActor(), agentName, scheduledFor, tenant }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't deploy the piece." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: scheduledFor
      ? `Scheduled — handed to ${agentName}. Manage the timing in the Outbox.`
      : `Deployed — handed off to ${agentName} for dispatch.`,
  };
}

/**
 * Operator launches a campaign once its pieces are approved. A real backend
 * state transition (campaign → live, approved deliverables unlocked) plus a
 * `campaign_launched` handoff event for Arc/Arc to execute the sends. The
 * app records state and hands off; it does not send anything itself.
 */
export async function launchCampaignAction(
  _previous: LaunchActionState,
  formData: FormData,
): Promise<LaunchActionState> {
  await requireOperator();
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the campaign can't be launched." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) {
    return { ok: false, message: "Missing campaign." };
  }

  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | undefined;
  if (scheduledForRaw) {
    try {
      scheduledFor = validateScheduledFor(scheduledForRaw, new Date());
    } catch (error) {
      if (error instanceof ScheduledForError) return { ok: false, message: error.message };
      throw error;
    }
  }

  let launchedAssets = 0;
  try {
    const tenant = await getCurrentAgentTaskTenantFields();
    ({ launchedAssets } = await launchCampaign({ campaignId, operator: await getOperatorActor(), agentName, scheduledFor, tenant }, getSupabaseAdminClient()));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't launch the campaign." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: scheduledFor
      ? `Scheduled — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed to ${agentName}. Manage the timing in the Outbox.`
      : `Campaign launched — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed off to ${agentName} for dispatch.`,
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
    const tenant = await getCurrentAgentTaskTenantFields();
    const result = await createOperatorCampaign({
      draft,
      operator: await getOperatorActor(),
      photos,
      client: getSupabaseAdminClient(),
      tenant,
    });
    campaignId = result.campaignId;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't create the campaign." };
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_PHOTOS = 20; // bounds total in-memory bytes per create (operator tool)

// `file.type` here is the browser-declared Content-Type — trusted because this runs
// behind the operator gate, not a public endpoint. A public upload path would need
// magic-byte sniffing instead.
async function readPhotos(formData: FormData): Promise<CampaignPhoto[]> {
  const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_PHOTOS) {
    throw new Error(`Attach at most ${MAX_PHOTOS} photos.`);
  }
  const photos: CampaignPhoto[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error(`"${file.name}" isn't an image.`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`"${file.name}" is larger than 10 MB.`);
    }
    photos.push({
      // Whitelist chars, then collapse any "..", so the filename can't introduce
      // surprising segments into the storage path created downstream.
      filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_"),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return photos;
}

/**
 * Operator describes a campaign; Arc builds it. Creates a shell campaign, a Arc
 * conversation linked to it, files the operator's first message, queues a board
 * task for Arc, then sends the operator into the chat. Outbound stays locked.
 *
 * Persona seed: `persona_homeowner_emergency` (the DB rejects `unassigned_persona`
 * via check constraint; Arc fills in the real persona during the build).
 * Restoration focus seed: `flood` (first valid enum value; Arc updates it).
 */
export async function askArcToBuildCampaignAction(formData: FormData): Promise<void> {
  await requireOperator();
  const agentName = await getAgentName();
  if (!isSupabaseAdminConfigured()) {
    redirect("/campaigns?action=not-configured");
  }

  let prompt: string;
  try {
    prompt = parseBuildPrompt(formData.get("prompt"));
  } catch {
    redirect("/campaigns?action=build-error");
  }

  const operator = await getOperatorActor();
  const client = getSupabaseAdminClient();
  const name = deriveCampaignName(prompt);
  const tenant = await getCurrentAgentTaskTenantFields();

  const { campaignId } = await createCampaignShell({
    operator,
    name,
    // DB rejects "unassigned_persona" (check constraint). Seed with a valid enum
    // value; Arc fills in the correct persona during the campaign build.
    persona: "persona_homeowner_emergency",
    // "general" is not in the restoration_focus enum. Seed with "flood" (first
    // valid value); Arc updates this when drafting the campaign.
    restorationFocus: "flood",
    agentName,
    client,
    tenant,
  });

  const conversation = await createConversation(
    { operator, title: name },
    client,
  );
  await assignConversationToCampaign(conversation.id, campaignId, client);
  await insertOperatorMessage(
    { conversationId: conversation.id, body: prompt, mentions: [] },
    client,
  );

  await queueCampaignBuildTask(
    {
      agentName,
      campaignId,
      conversationId: conversation.id,
      operator,
      prompt,
      tenant,
    },
    client,
  );

  revalidatePath("/campaigns");
  redirect(`/arc?c=${conversation.id}`);
}

/** Hand an existing campaign to Arc to keep building. Queues a board task linked
 *  to the campaign. */
export async function handToArcAction(formData: FormData): Promise<void> {
  await requireOperator();
  const agentName = await getAgentName();
  if (!isSupabaseAdminConfigured()) {
    redirect("/campaigns?action=not-configured");
  }
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!UUID_RE.test(campaignId)) redirect("/campaigns?action=build-error");

  const client = getSupabaseAdminClient();
  const tenant = await getCurrentAgentTaskTenantFields();
  await queueCampaignDirectiveTask(
    {
      agentName,
      campaignId,
      operator: await getOperatorActor(),
      prompt: "Continue building this campaign - draft the remaining assets.",
      tenant,
    },
    client,
  );

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?action=handed-to-arc`);

}

export type AttachMediaActionState = { ok: boolean; message: string } | null;

/**
 * Operator attaches an approved Library media asset to an existing campaign
 * asset (e.g. an email's hero). Gated + Supabase-guarded; persists in place via
 * `attachMediaToCampaignAsset`. Outbound stays locked — this only adds creative.
 */
export async function attachMediaAction(
  _previous: AttachMediaActionState,
  formData: FormData,
): Promise<AttachMediaActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so media can't be attached." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const libraryAssetId = String(formData.get("libraryAssetId") ?? "").trim();
  if (!assetId || !libraryAssetId) {
    return { ok: false, message: "Pick a deliverable and a Library asset to attach." };
  }

  let attached = false;
  try {
    const tenant = await getCurrentAgentTaskTenantFields();
    const result = await attachMediaToCampaignAsset(
      { assetId, libraryAssetId, operator: await getOperatorActor(), tenant },
      getSupabaseAdminClient(),
    );
    attached = result.attached;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't attach the media." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: attached ? "Approved media attached." : "That media is already attached to this piece.",
  };
}

/**
 * Load the workspace's attachable Library media for the operator's attach
 * picker. Gated; returns [] when Supabase isn't configured (picker shows empty).
 */
export async function listAttachableMediaAction(): Promise<AttachableMediaItem[]> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return [];
  const tenant = await getCurrentAgentTaskTenantFields();
  return listAttachableMedia(tenant.org_id, getSupabaseAdminClient());
}
