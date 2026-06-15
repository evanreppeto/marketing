"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CampaignDraftValidationError, parseCampaignDraft, RevisionInstructionError, validateRevisionInstruction } from "@/domain";
import { createCampaignShell, createOperatorCampaign, type CampaignPhoto } from "@/lib/campaigns/create";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { type ApprovalDecision, decideApprovalItem, decideAsset, reopenAsset } from "@/lib/campaigns/decisions";
import { deployAsset, launchCampaign } from "@/lib/campaigns/launch";
import { sendMarkDirective } from "@/lib/campaigns/mark-conversation";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getAgentName } from "@/lib/settings/agent-name";
import { assignConversationToCampaign, createConversation, insertOperatorMessage } from "@/lib/mark-chat/persistence";
import { parseBuildPrompt, deriveCampaignName } from "./build-campaign";

const DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    await requestAssetRevision({ campaignId, assetId, instruction, operator: getOperatorActor() }, getSupabaseAdminClient());
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
  if (message.length > MAX_MARK_MESSAGE) {
    return { ok: false, message: `Keep it under ${MAX_MARK_MESSAGE} characters.` };
  }

  try {
    await sendMarkDirective({ campaignId, message, operator: getOperatorActor(), agentName }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `Couldn't send the message to ${agentName}.` };
  }

  revalidatePath(`/campaigns/${campaignId}`);

  return { ok: true, message: `Sent to ${agentName} — queued. Its reply lands here when it's done.` };
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
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the piece can't be deployed." };
  }

  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!assetId) {
    return { ok: false, message: "Missing deliverable." };
  }

  try {
    await deployAsset({ campaignId, assetId, operator: getOperatorActor(), agentName }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't deploy the piece." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  return { ok: true, message: `Deployed — handed off to ${agentName} for dispatch.` };
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
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the campaign can't be launched." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) {
    return { ok: false, message: "Missing campaign." };
  }

  let launchedAssets = 0;
  try {
    ({ launchedAssets } = await launchCampaign({ campaignId, operator: getOperatorActor(), agentName }, getSupabaseAdminClient()));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't launch the campaign." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: `Campaign launched — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed off to ${agentName} for dispatch.`,
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
 * Operator describes a campaign; Mark builds it. Creates a shell campaign, a Mark
 * conversation linked to it, files the operator's first message, queues a board
 * task for Mark, then sends the operator into the chat. Outbound stays locked.
 *
 * Persona seed: `persona_homeowner_emergency` (the DB rejects `unassigned_persona`
 * via check constraint; Mark fills in the real persona during the build).
 * Restoration focus seed: `flood` (first valid enum value; Mark updates it).
 */
export async function askMarkToBuildCampaignAction(formData: FormData): Promise<void> {
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

  const operator = getOperatorActor();
  const client = getSupabaseAdminClient();
  const name = deriveCampaignName(prompt);

  const { campaignId } = await createCampaignShell({
    operator,
    name,
    // DB rejects "unassigned_persona" (check constraint). Seed with a valid enum
    // value; Mark fills in the correct persona during the campaign build.
    persona: "persona_homeowner_emergency",
    // "general" is not in the restoration_focus enum. Seed with "flood" (first
    // valid value); Mark updates this when drafting the campaign.
    restorationFocus: "flood",
    client,
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

  await client.from("agent_tasks").insert({
    agent_id: await ensureMarkAgentId(agentName, client),
    status: "queued",
    priority: "high",
    objective: `Build campaign package: ${prompt.slice(0, 180)}`,
    task_type: "campaign_brief_draft",
    campaign_id: campaignId,
    source_type: "campaign_directive",
    source_id: campaignId,
    metadata: {
      requested_from: "campaigns_ask_mark",
      conversation_id: conversation.id,
      human_approval_required: true,
      outbound_dispatch_allowed: false,
    },
  });

  revalidatePath("/campaigns");
  redirect(`/mark?c=${conversation.id}`);
}

/** Hand an existing campaign to Mark to keep building. Queues a board task linked
 *  to the campaign. */
export async function handToMarkAction(formData: FormData): Promise<void> {
  await requireOperator();
  const agentName = await getAgentName();
  if (!isSupabaseAdminConfigured()) {
    redirect("/campaigns?action=not-configured");
  }
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!UUID_RE.test(campaignId)) redirect("/campaigns?action=build-error");

  const client = getSupabaseAdminClient();
  await client.from("agent_tasks").insert({
    agent_id: await ensureMarkAgentId(agentName, client),
    status: "queued",
    priority: "medium",
    objective: "Continue building this campaign — draft the remaining assets.",
    task_type: "campaign_directive",
    campaign_id: campaignId,
    source_type: "campaign_directive",
    source_id: campaignId,
    metadata: { requested_from: "campaign_overview_hand_to_mark", human_approval_required: true, outbound_dispatch_allowed: false },
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?action=handed-to-mark`);
}

/** Ensure the Mark agent row exists; return its id.
 *  Canonical full definition lives in ensureMarkAgent (agent-operations/actions.ts).
 *  This carries the safety-critical subset; a shared helper is a future cleanup.
 *  `agentName` is the operator-configured display name stored on the row. */
async function ensureMarkAgentId(agentName: string, client = getSupabaseAdminClient()): Promise<string> {
  const { data, error } = await client
    .from("agents")
    .upsert(
      {
        key: "mark",
        name: agentName,
        status: "ready",
        blocked_actions: ["send_email", "send_sms", "publish_social_post", "launch_ads", "change_ad_spend"],
        default_approval_policy: "human_required_before_outbound",
      },
      { onConflict: "key" },
    )
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`agents upsert failed: ${error.message}`);
  return data.id;
}
