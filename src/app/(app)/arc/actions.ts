"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  parseArcMode,
  parseArcRoute,
  parseMentions,
  validateRevisionInstruction,
  type ArcMention,
  type ArcMode,
  type ArcRoute,
} from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { decideAsset, type ApprovalDecision } from "@/lib/campaigns/decisions";
import { listCampaignNames } from "@/lib/campaigns/read-model";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getArcDisplayName } from "@/lib/arc-chat/agent-config";
import { isAcceptedAttachment } from "@/lib/arc-chat/attachment-types";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import { cancelChatTask } from "@/lib/arc-chat/inbox";
import {
  archiveConversation,
  assignConversationToCampaign,
  createConversation,
  deleteConversation,
  deleteMessagesAfter,
  getArcMessage,
  getConversation,
  getMessageConversationId,
  getPrecedingOperatorMessage,
  insertOperatorMessage,
  parseArcAttachmentsJson,
  renameConversation,
  setArcMessageFeedback,
  setConversationPinned,
  touchConversation,
  updateOperatorMessageBody,
  type ArcAttachment,
  type ArcMessage,
} from "@/lib/arc-chat/persistence";
import { saveItem } from "@/lib/arc-chat/saved";
import { assertConversationAccess } from "@/lib/arc-chat/sharing";
import { ALL_ARC_SKILLS, ARC_SKILL_LIBRARY, skillIdForArcCommand } from "@/lib/arc-skills/catalog";
import { instructionForWorkspaceSkill, parseWorkspaceArcSkills, type WorkspaceArcSkill } from "@/lib/arc-skills/custom";
import { ARC_CUSTOM_SKILLS_SETTING, getWorkspaceArcSkills, previewGithubArcSkill } from "@/lib/arc-skills/github";
import { getInstalledArcSkillKeys, ARC_INSTALLED_SKILLS_SETTING } from "@/lib/arc-skills/installation";
import { getCreationTenancy } from "@/lib/arc-chat/sharing";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { checkUsageAllowed, formatCentsUsd } from "@/lib/billing/entitlements";
import { storeGeneratedMedia } from "@/lib/media/storage";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { saveAppSettings } from "@/lib/settings/store";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const CONTEXT_SCOPES = new Set(["workspace", "brand", "crm", "campaigns"]);

export type SendArcMessageResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

export type UploadArcAttachmentResult =
  | { ok: true; attachment: ArcAttachment }
  | { ok: false; error: string };

export type ArcInteractionResult = { ok: true } | { ok: false; error: string };

export type ArcSkillInstallResult =
  | { ok: true; installedSkillKeys: string[]; persisted: boolean }
  | { ok: false; error: string };

export type ArcGithubSkillPreviewResult =
  | { ok: true; skill: WorkspaceArcSkill }
  | { ok: false; error: string };

export type ArcGithubSkillInstallResult =
  | { ok: true; skills: WorkspaceArcSkill[]; persisted: boolean }
  | { ok: false; error: string };

export async function previewArcGithubSkillAction(input: { url: string }): Promise<ArcGithubSkillPreviewResult> {
  await requireOperator();
  try {
    return { ok: true, skill: await previewGithubArcSkill(input.url) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Arc could not review that GitHub skill." };
  }
}

/** Persist a server-reviewed GitHub skill. The server normalizes every field and
 * rejects command collisions; arbitrary GitHub content never expands tool access. */
export async function installArcGithubSkillAction(input: { url: string }): Promise<ArcGithubSkillInstallResult> {
  await requireOperator();
  let skill: WorkspaceArcSkill;
  try {
    skill = await previewGithubArcSkill(input.url);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "That skill did not pass Arc's review." };
  }
  const command = skill.commands[0]!.replace(/^\//, "");
  const reserved = ALL_ARC_SKILLS.some((candidate) => candidate.commands.some((item) => item.replace(/^\//, "") === command));
  if (reserved) return { ok: false, error: `${skill.commands[0]} is already used by Arc. Rename the skill command before installing it.` };
  if (!isSupabaseAdminConfigured()) return { ok: true, skills: [skill], persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    if (!orgId) return { ok: false, error: "No active workspace is available." };
    const client = getSupabaseAdminClient();
    const current = await getWorkspaceArcSkills(orgId, client);
    const commandCollision = current.some((candidate) => candidate.key !== skill.key && candidate.commands[0] === skill.commands[0]);
    if (commandCollision) return { ok: false, error: `${skill.commands[0]} is already used by an installed workspace skill.` };
    const next = parseWorkspaceArcSkills([...current.filter((candidate) => candidate.key !== skill.key), skill]);
    await saveAppSettings(client, orgId, { [ARC_CUSTOM_SKILLS_SETTING]: next });
    revalidatePath("/arc");
    return { ok: true, skills: next, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not install that skill." };
  }
}

export async function removeArcGithubSkillAction(input: { skillKey: string }): Promise<ArcGithubSkillInstallResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: true, skills: [], persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    if (!orgId) return { ok: false, error: "No active workspace is available." };
    const client = getSupabaseAdminClient();
    const next = (await getWorkspaceArcSkills(orgId, client)).filter((skill) => skill.key !== input.skillKey);
    await saveAppSettings(client, orgId, { [ARC_CUSTOM_SKILLS_SETTING]: next });
    revalidatePath("/arc");
    return { ok: true, skills: next, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove that skill." };
  }
}

/** Install or remove a reviewed library skill for the current workspace. */
export async function setArcSkillInstalledAction(input: {
  skillKey: string;
  installed: boolean;
}): Promise<ArcSkillInstallResult> {
  await requireOperator();
  const skill = ARC_SKILL_LIBRARY.find((candidate) => candidate.key === input.skillKey);
  if (!skill) return { ok: false, error: "That skill is not available in the Arc library." };

  if (!isSupabaseAdminConfigured()) {
    return { ok: true, installedSkillKeys: input.installed ? [skill.key] : [], persisted: false };
  }

  try {
    const orgId = await getCurrentOrgId();
    if (!orgId) return { ok: false, error: "No active workspace is available." };
    const client = getSupabaseAdminClient();
    const current = await getInstalledArcSkillKeys(orgId, client);
    const next = input.installed
      ? [...new Set([...current, skill.key])]
      : current.filter((key) => key !== skill.key);
    await saveAppSettings(client, orgId, { [ARC_INSTALLED_SKILLS_SETTING]: next });
    revalidatePath("/arc");
    return { ok: true, installedSkillKeys: next, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update this skill." };
  }
}

/**
 * Send an operator chat message to Arc. Persists the operator turn and enqueues
 * an agent_task for the runner to reply to — nothing goes outbound (the enqueue
 * stamps `outbound_locked: true`). Starts a new conversation when `conversationId`
 * is null. Returns the (new or existing) conversation id so the client can pin
 * the URL to it.
 */
export async function sendArcMessageAction(input: {
  conversationId: string | null;
  body: string;
  mentions?: ArcMention[];
  attachments?: ArcAttachment[];
  mode?: ArcMode;
  route?: ArcRoute;
  command?: string | null;
  contextScopes?: string[];
}): Promise<SendArcMessageResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Arc chat needs a connected backend." };
  }

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "That message is too long — trim it down a bit." };
  }

  // Pre-flight plan/quota gate: don't spend Arc (Claude) budget when the org is
  // over its monthly cap. Non-blocking until ARC_BILLING_ENFORCEMENT is armed.
  const gate = await checkUsageAllowed(await getCurrentOrgId());
  if (!gate.allowed) {
    return {
      ok: false,
      error: `You've reached this month's plan limit (${formatCentsUsd(gate.capCents)} on the ${gate.tier} plan). It resets next cycle — or upgrade to keep going.`,
    };
  }

  try {
    const operator = await getOperatorActor();
    const mentions = parseMentions(input.mentions);
    const attachments = parseArcAttachmentsJson(JSON.stringify(input.attachments ?? []));
    const mode = parseArcMode(input.mode);
    const route = parseArcRoute(input.route);
    const command = typeof input.command === "string" ? input.command.trim().replace(/^\//, "") || null : null;
    const workspaceSkill = command
      ? (await getWorkspaceArcSkills(await getCurrentOrgId())).find((skill) => skill.commands.some((candidate) => candidate.replace(/^\//, "") === command)) ?? null
      : null;
    const skillId = workspaceSkill?.id ?? skillIdForArcCommand(command);
    const runnerMessage = workspaceSkill ? instructionForWorkspaceSkill(workspaceSkill, body) : body;
    const contextScopes = (input.contextScopes ?? []).filter((scope) => CONTEXT_SCOPES.has(scope));
    const selectedCampaignId = mentions.find((mention) => mention.type === "campaign")?.id ?? null;

    let conversationId = input.conversationId;
    let conversationProjectId: string | null = null;
    let conversationCampaignId: string | null = selectedCampaignId;
    if (!conversationId) {
      const tenancy = await getCreationTenancy();
      const conversation = await createConversation({
        operator,
        title: body.length > 60 ? `${body.slice(0, 57)}…` : body,
        campaignId: selectedCampaignId,
        ownerId: tenancy.ownerId,
        workspaceId: tenancy.workspaceId,
        orgId: tenancy.orgId,
      });
      conversationId = conversation.id;
      conversationProjectId = conversation.projectId;
      conversationCampaignId = conversation.campaignId;
    } else {
      const conversation = await getConversation(conversationId);
      conversationProjectId = conversation?.projectId ?? null;
      conversationCampaignId = selectedCampaignId ?? conversation?.campaignId ?? null;
      if (selectedCampaignId && selectedCampaignId !== conversation?.campaignId) {
        await assignConversationToCampaign(conversationId, selectedCampaignId);
      }
    }

    const message = await insertOperatorMessage({
      conversationId,
      body,
      mentions,
      attachments,
      mode,
      route,
      command,
      skillId,
      contextScopes,
    });
    await enqueueArcChatTask({
      conversationId,
      projectId: conversationProjectId,
      campaignId: conversationCampaignId,
      messageId: message.id,
      message: runnerMessage,
      mentions,
      attachments,
      operator,
      mode,
      route,
      command,
      skillId,
      contextScopes,
      agentName: await getArcDisplayName(),
    });
    await touchConversation(conversationId);

    revalidatePath("/arc");
    return { ok: true, conversationId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't send that message.",
    };
  }
}

/**
 * Re-queue an operator turn for Arc using an existing operator message's settings
 * (mode/route/mentions/attachments/command/scope) but a given body — the shared
 * spine of Regenerate and Edit-and-resend. Inserts a fresh pending reply bubble
 * (via enqueueArcChatTask) and wakes the runner. Outbound stays locked.
 */
async function reEnqueueTurn(operatorMessage: ArcMessage, body: string): Promise<void> {
  const command = operatorMessage.command?.replace(/^\//, "") ?? null;
  const workspaceSkill = command
    ? (await getWorkspaceArcSkills(await getCurrentOrgId())).find((skill) => skill.commands.some((candidate) => candidate.replace(/^\//, "") === command)) ?? null
    : null;
  const conversation = await getConversation(operatorMessage.conversationId);
  await enqueueArcChatTask({
    conversationId: operatorMessage.conversationId,
    projectId: conversation?.projectId ?? null,
    campaignId: conversation?.campaignId ?? null,
    messageId: operatorMessage.id,
    message: workspaceSkill ? instructionForWorkspaceSkill(workspaceSkill, body) : body,
    mentions: operatorMessage.mentions,
    attachments: operatorMessage.attachments,
    operator: await getOperatorActor(),
    mode: operatorMessage.mode,
    route: operatorMessage.route,
    command: operatorMessage.command,
    skillId: operatorMessage.skillId,
    contextScopes: operatorMessage.contextScopes,
    agentName: await getArcDisplayName(),
  });
  await touchConversation(operatorMessage.conversationId);
}

/**
 * Regenerate an Arc reply: re-run the operator turn that produced it. Truncates
 * everything after that operator message (the reply and anything later) and
 * re-queues the turn, so a fresh reply streams in. Gated + org-scoped; outbound
 * stays locked.
 */
export async function regenerateArcReplyAction(replyMessageId: string): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Regenerating needs a connected backend." };
  try {
    const reply = await getArcMessage(replyMessageId);
    if (!reply || reply.role !== "arc") return { ok: false, error: "That response can't be regenerated." };
    await assertConversationAccess(reply.conversationId, "collaborate");
    const gate = await checkUsageAllowed(await getCurrentOrgId());
    if (!gate.allowed) {
      return { ok: false, error: `You've reached this month's plan limit (${formatCentsUsd(gate.capCents)} on the ${gate.tier} plan). It resets next cycle — or upgrade to keep going.` };
    }
    const operatorMessage = await getPrecedingOperatorMessage(reply.conversationId, reply.createdAt);
    if (!operatorMessage) return { ok: false, error: "Couldn't find the message to regenerate from." };
    await deleteMessagesAfter(reply.conversationId, operatorMessage.id);
    await reEnqueueTurn(operatorMessage, operatorMessage.body);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't regenerate that response." };
  }
}

/**
 * Edit an operator message and resend it: update the body, truncate everything
 * after it, and re-run the turn (Arc replies fresh to the edited message). This
 * is the standard chat edit-forks-the-branch behavior. Gated + org-scoped.
 */
export async function editAndResendArcMessageAction(input: { messageId: string; body: string }): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Editing needs a connected backend." };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That message is too long — trim it down a bit." };
  try {
    const message = await getArcMessage(input.messageId);
    if (!message || message.role !== "operator") return { ok: false, error: "That message can't be edited." };
    await assertConversationAccess(message.conversationId, "collaborate");
    const gate = await checkUsageAllowed(await getCurrentOrgId());
    if (!gate.allowed) {
      return { ok: false, error: `You've reached this month's plan limit (${formatCentsUsd(gate.capCents)} on the ${gate.tier} plan). It resets next cycle — or upgrade to keep going.` };
    }
    const updated = await updateOperatorMessageBody(input.messageId, body);
    if (!updated) return { ok: false, error: "That message can't be edited." };
    await deleteMessagesAfter(message.conversationId, message.id);
    await reEnqueueTurn(message, body);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't resend that message." };
  }
}

/**
 * Rename a conversation. Gated by requireOperator + collaborate access; org-scoped
 * via the access check. Best-effort revalidate so the thread list + header update.
 */
export async function renameArcConversationAction(input: { conversationId: string; title: string }): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Renaming needs a connected backend." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the conversation a name." };
  if (title.length > 120) return { ok: false, error: "That title is too long — keep it under 120 characters." };
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    await renameConversation(input.conversationId, title);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't rename that conversation." };
  }
}

/** Pin or unpin a conversation (pinned threads sort to the top of the list). */
export async function pinArcConversationAction(input: { conversationId: string; pinned: boolean }): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Pinning needs a connected backend." };
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    await setConversationPinned(input.conversationId, input.pinned);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't update that conversation." };
  }
}

/** Explicitly link a conversation to one workspace campaign, or remove the
 * relationship. This is the operator-facing counterpart to automatic linking
 * when a campaign is @-mentioned in chat. */
export async function assignArcConversationCampaignAction(input: {
  conversationId: string;
  campaignId: string | null;
}): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Campaign linking needs a connected backend." };
  const campaignId = input.campaignId?.trim() || null;
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    if (campaignId) {
      const orgId = await getCurrentOrgId();
      const campaign = (await listCampaignNames(orgId)).find((candidate) => candidate.id === campaignId);
      if (!campaign) return { ok: false, error: "That campaign is not available in this workspace." };
    }
    await assignConversationToCampaign(input.conversationId, campaignId);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't update this conversation's campaign." };
  }
}

/** Archive a conversation — removes it from the active list without deleting it. */
export async function archiveArcConversationAction(conversationId: string): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Archiving needs a connected backend." };
  try {
    await assertConversationAccess(conversationId, "collaborate");
    await archiveConversation(conversationId);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't archive that conversation." };
  }
}

/** Permanently delete a conversation and its messages (cascade). Destructive — the
 *  UI confirms first. Gated by requireOperator + collaborate access. */
export async function deleteArcConversationAction(conversationId: string): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Deleting needs a connected backend." };
  try {
    await assertConversationAccess(conversationId, "collaborate");
    await deleteConversation(conversationId);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't delete that conversation." };
  }
}

export async function uploadArcAttachmentAction(formData: FormData): Promise<UploadArcAttachmentResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Attachments need a connected workspace." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Keep attachments under 15 MB." };
  if (!isAcceptedAttachment(file.type)) return { ok: false, error: "Use an image, PDF, text, Markdown, or CSV file." };

  try {
    const context = await getCurrentWorkspaceContext();
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() : "";
    const objectPath = `arc-attachments/${context.orgId}/${context.workspaceId ?? "default"}/${randomUUID()}${extension ? `.${extension}` : ""}`;
    const url = await storeGeneratedMedia(objectPath, Buffer.from(await file.arrayBuffer()), file.type);
    return { ok: true, attachment: { url, objectPath, contentType: file.type, name: file.name } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't upload that attachment." };
  }
}

export async function cancelArcRunAction(input: {
  taskId: string;
  conversationId: string;
}): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Stopping runs needs a connected backend." };
  if (!input.taskId.trim() || !input.conversationId.trim()) return { ok: false, error: "This run is missing its receipt id." };

  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    const context = await getCurrentWorkspaceContext();
    if (!context.workspaceId) return { ok: false, error: "No active workspace is available." };
    const result = await cancelChatTask({
      agentTaskId: input.taskId,
      conversationId: input.conversationId,
      canceledBy: await getOperatorActor(),
    }, undefined, { orgId: context.orgId, workspaceId: context.workspaceId });
    if (!result.ok) {
      return { ok: false, error: result.reason === "already_finished" ? "That run already finished." : "That run could not be found." };
    }
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't stop that run." };
  }
}

export async function setArcMessageFeedbackAction(input: {
  messageId: string;
  value: "up" | "down" | null;
}): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Feedback needs a connected backend." };
  try {
    const conversationId = await getMessageConversationId(input.messageId);
    if (!conversationId) return { ok: false, error: "That response could not be found." };
    await assertConversationAccess(conversationId, "collaborate");
    await setArcMessageFeedback(input.messageId, input.value);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't save that feedback." };
  }
}

export type ArcDraftDecisionResult =
  | { ok: true; persisted: boolean; status?: string }
  | { ok: false; error: string };

const DRAFT_DECISIONS: ReadonlySet<string> = new Set(["approved", "declined"]);

/**
 * Approve or decline an Arc-drafted campaign deliverable straight from the chat —
 * the "human approves decisions" gate, in-flow. A real backend state transition
 * (via decideAsset) that NEVER unlocks outbound dispatch; gated by requireOperator
 * and org-scoped. `persisted: false` is the honest offline/demo signal so the card
 * can reflect the decision without saving.
 */
export async function decideArcDraftAction(input: {
  campaignId: string;
  assetId: string;
  decision: string;
}): Promise<ArcDraftDecisionResult> {
  await requireOperator();
  if (!DRAFT_DECISIONS.has(input.decision)) return { ok: false, error: "Unknown decision." };
  if (!input.campaignId.trim() || !input.assetId.trim()) return { ok: false, error: "This draft is missing its campaign reference." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: input.decision };

  try {
    const operator = await getOperatorActor();
    const tenant = await getCurrentAgentTaskTenantFields();
    const result = await decideAsset({ assetId: input.assetId, campaignId: input.campaignId, decision: input.decision as ApprovalDecision, operator, tenant });
    revalidatePath("/arc");
    return { ok: true, persisted: true, status: result.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't record that decision." };
  }
}

/**
 * Ask Arc to revise a drafted deliverable from the chat — reuses the wired
 * campaign revision flow (requestAssetRevision), so Arc re-drafts behind approval.
 * Gated by requireOperator; outbound stays locked.
 */
export async function requestArcDraftRevisionAction(input: {
  campaignId: string;
  assetId: string;
  instruction: string;
}): Promise<ArcDraftDecisionResult> {
  await requireOperator();
  let cleaned: string;
  try {
    cleaned = validateRevisionInstruction(input.instruction);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tell Arc what to change." };
  }
  if (!input.campaignId.trim() || !input.assetId.trim()) return { ok: false, error: "This draft is missing its campaign reference." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: "revision_requested" };

  try {
    const operator = await getOperatorActor();
    await requestAssetRevision({ campaignId: input.campaignId, assetId: input.assetId, instruction: cleaned, operator });
    revalidatePath("/arc");
    return { ok: true, persisted: true, status: "revision_requested" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't request that revision." };
  }
}

export async function saveArcMessageAction(messageId: string): Promise<ArcInteractionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Saving responses needs a connected backend." };
  try {
    const message = await getArcMessage(messageId);
    if (!message || message.role !== "arc" || !message.body.trim()) {
      return { ok: false, error: "That response cannot be saved." };
    }
    await assertConversationAccess(message.conversationId, "view");
    const context = await getCurrentWorkspaceContext();
    await saveItem({
      operator: await getOperatorActor(),
      orgId: context.orgId,
      workspaceId: context.workspaceId,
      kind: message.actions.some((action) => action.kind === "draft") ? "draft" : "angle",
      title: message.body.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").slice(0, 90) ?? "Arc response",
      body: message.body,
      sourceConversationId: message.conversationId,
      sourceMessageId: message.id,
      note: "Saved from Arc chat",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't save that response." };
  }
}
