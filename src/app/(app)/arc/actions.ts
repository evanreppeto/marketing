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
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getArcDisplayName } from "@/lib/arc-chat/agent-config";
import { isAcceptedAttachment } from "@/lib/arc-chat/attachment-types";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import { cancelChatTask } from "@/lib/arc-chat/inbox";
import {
  createConversation,
  getArcMessage,
  getMessageConversationId,
  insertOperatorMessage,
  parseArcAttachmentsJson,
  setArcMessageFeedback,
  touchConversation,
  type ArcAttachment,
} from "@/lib/arc-chat/persistence";
import { saveItem } from "@/lib/arc-chat/saved";
import { assertConversationAccess } from "@/lib/arc-chat/sharing";
import { skillIdForArcCommand } from "@/lib/arc-skills/catalog";
import { getCreationTenancy } from "@/lib/arc-chat/sharing";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { checkUsageAllowed, formatCentsUsd } from "@/lib/billing/entitlements";
import { storeGeneratedMedia } from "@/lib/media/storage";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

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
    const skillId = skillIdForArcCommand(command);
    const contextScopes = (input.contextScopes ?? []).filter((scope) => CONTEXT_SCOPES.has(scope));

    let conversationId = input.conversationId;
    if (!conversationId) {
      const tenancy = await getCreationTenancy();
      const conversation = await createConversation({
        operator,
        title: body.length > 60 ? `${body.slice(0, 57)}…` : body,
        ownerId: tenancy.ownerId,
        workspaceId: tenancy.workspaceId,
        orgId: tenancy.orgId,
      });
      conversationId = conversation.id;
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
      messageId: message.id,
      message: body,
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
