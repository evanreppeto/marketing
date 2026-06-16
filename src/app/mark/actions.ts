"use server";

import { createHmac, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createSignedReadUrl, createSignedUploadUrl, isGcsConfigured } from "@/lib/storage/gcs";

import { deriveThreadTitle, parseMarkMode, parseMarkRoute, parseMentions, validateMarkMessageInput, MarkMessageError, type MarkMode, type MarkRoute } from "@/domain";
import { resolveAgentConnection } from "@/lib/agent/connection";
import { recordTestResult } from "@/lib/agent/health";
import { resolveWebhookSecret } from "@/lib/agent/secret";
import { hasActiveAgentTokens } from "@/lib/agent/tokens";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { enqueueMarkChatTask } from "@/lib/mark-chat/enqueue";
import { getMarkDisplayName, isAgentLive } from "@/lib/mark-chat/agent-config";
import { claimChatTask } from "@/lib/mark-chat/inbox";
import { loadWakeContext } from "@/lib/mark-chat/history";
import { notifyMarkWebhook } from "@/lib/mark-chat/notify";
import { logMarkChatStatus } from "@/lib/mark-chat/status-log";
import { getAppSettings } from "@/lib/settings/store";
import { getAgentName } from "@/lib/settings/agent-name";
import {
  archiveConversation,
  assignConversationToCampaign,
  assignConversationToProject,
  cancelPendingMarkMessage,
  createConversation,
  createProject,
  deleteConversation,
  insertFailedMarkMessage,
  insertOperatorMessage,
  insertPendingMarkMessage,
  listMessages,
  parseMarkAttachmentsJson,
  renameConversation,
  renameProject,
  setConversationPinned,
  setMarkMessageFeedback,
  touchConversation,
  unarchiveConversation,
  type MarkMessage,
} from "@/lib/mark-chat/persistence";
import { type ApprovalDecision, decideAsset } from "@/lib/campaigns/decisions";
import { editDraftAsset, getDraftAsset, type DraftAssetView } from "@/lib/campaigns/draft-editing";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { saveItem, removeSavedItem, getSavedItem, markPromoted, type SavedKind } from "@/lib/mark-chat/saved";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { validatePromoteTarget, type PromoteTarget } from "./promote-target";

export type SendMessageState = { ok: boolean; message: string; conversationId?: string } | null;

/**
 * Operator sends Mark a message. Persists the message, enqueues an agent_task,
 * and drops a pending Mark bubble that the callback later completes. Creates the
 * conversation on the first message. No live AI; outbound stays locked.
 */
export async function sendMarkMessageAction(_previous: SendMessageState, formData: FormData): Promise<SendMessageState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    const agentName = await getAgentName();
    return { ok: false, message: `Supabase isn't configured yet, so ${agentName} can't receive the message.` };
  }

  const rawBody = String(formData.get("body") ?? "");
  const mentions = parseMentions(String(formData.get("mentions") ?? "[]"));
  const mode = parseMarkMode(formData.get("mode"));
  const route = parseMarkRoute(formData.get("route"));
  const settings = await getAppSettings();
  // Structured slash command (e.g. "find-leads"); travels to the agent as real
  // intent alongside the message + mentions, not just text.
  const command = String(formData.get("command") ?? "").trim() || null;
  // Operator-uploaded reference images (already in GCS); travel to Mark as context.
  const attachments = parseMarkAttachmentsJson(String(formData.get("attachments") ?? "[]"));
  let body: string;
  let cleanMentions = mentions;
  try {
    const effectiveBody = rawBody.trim() === "" && attachments.length > 0 ? "Shared an image for reference." : rawBody;
    const validated = validateMarkMessageInput({ body: effectiveBody, mentions });
    body = validated.body;
    cleanMentions = validated.mentions;
  } catch (error) {
    if (error instanceof MarkMessageError) return { ok: false, message: error.message };
    throw error;
  }

  const operator = getOperatorActor();
  const client = getSupabaseAdminClient();
  const existingId = String(formData.get("conversationId") ?? "").trim();
  // Optional project chosen in the composer footer — assigned on a new thread.
  const projectId = String(formData.get("projectId") ?? "").trim() || null;

  let conversationId = existingId;
  let messageId: string;
  try {
    if (!conversationId) {
      const conversation = await createConversation({ operator, title: deriveThreadTitle(body), projectId }, client);
      conversationId = conversation.id;
    }
    const operatorMessage = await insertOperatorMessage({ conversationId, body, mentions: cleanMentions, attachments, mode, route }, client);
    messageId = operatorMessage.id;
    await touchConversation(conversationId, client);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save your message." };
  }

  // Event-driven (Telegram-style): enqueue the task, drop a pending bubble, then
  // POST a small wake to Mark's webhook so it processes just this message and
  // sleeps. Routine chat rides the cheap/fast model route. Outbound stays locked.
  // If Mark isn't connected, record a failed reply so the thread shows what
  // happened instead of hanging on "thinking".
  const agentName = await getAgentName();
  try {
    const agentTaskId = await enqueueMarkChatTask(
      {
        conversationId,
        messageId,
        message: body,
        mentions: cleanMentions,
        operator,
        route,
        mode,
        command,
        assistantTone: settings.assistantTone,
        assistantResponseStyle: settings.assistantResponseStyle,
        approvalStrictness: settings.approvalStrictness,
        attachments,
        agentName,
      },
      client,
    );
    await insertPendingMarkMessage({ conversationId, agentTaskId }, client);
    logMarkChatStatus("queued", { agentTaskId, conversationId });
    // Wake Mark (push). Best-effort — never blocks or fails the send. On a
    // delivered wake we claim the task (queued -> running) so the inbox poll
    // won't hand the same message out again; a missed wake stays queued for it.
    logMarkChatStatus("waking_mark", { agentTaskId, conversationId });
    const wakeContext = await loadWakeContext(conversationId, { excludeId: messageId }, client);
    const delivered = await notifyMarkWebhook({
      messageId,
      conversationId,
      projectId: wakeContext.projectId,
      campaignId: wakeContext.campaignId,
      agentTaskId,
      message: body,
      mentions: cleanMentions,
      operator,
      route,
      mode,
      assistantTone: settings.assistantTone,
      assistantResponseStyle: settings.assistantResponseStyle,
      approvalStrictness: settings.approvalStrictness,
      command,
      attachments,
      history: wakeContext.history,
    });
    if (delivered) {
      const claimed = await claimChatTask(agentTaskId, client).catch(() => false);
      if (claimed) logMarkChatStatus("processing", { agentTaskId, conversationId, detail: "via=wake" });
    }
  } catch (error) {
    await insertFailedMarkMessage(
      { conversationId, body: error instanceof Error ? error.message : `${agentName} couldn't be reached.` },
      client,
    ).catch(() => undefined);
  }

  // Only revalidate when the message landed in the thread the user is already
  // viewing. For a brand-new conversation the client immediately pushes to
  // /mark?c=<id> (a fresh dynamic render); revalidating here would re-render
  // the bare /mark hero underneath the in-flight navigation — a visible flash
  // back to "What should Mark work on?" between send and thread.
  if (existingId) revalidatePath("/mark");
  return { ok: true, message: "Sent.", conversationId };
}

export type MarkAgentStatus = {
  attached: boolean;
  name: string;
  lastSeenAt: string | null;
  lastStatus: "ok" | "error" | "unreachable" | null;
};

/**
 * Connection signal for the Mark header: is an agent actually attached and live?
 * Judged by a recent ok heartbeat — recordAgentSeen() stamps last_seen_at on every
 * authenticated /api/v1/hermes call (the poller's poll, a realtime reply, a webhook
 * test), so this is true whether the agent is wired via realtime, polling, or a
 * webhook, and does not depend on a configured runner URL or agent-key naming. When
 * false, sends still queue for pickup — the UI says so plainly.
 */
export async function getMarkAgentStatusAction(): Promise<MarkAgentStatus> {
  const connection = await resolveAgentConnection();
  const name = await getMarkDisplayName();
  const attached =
    isSupabaseAdminConfigured() &&
    isAgentLive(connection.health.lastStatus, connection.health.lastSeenAt, Date.now());
  return {
    attached,
    name,
    lastSeenAt: connection.health.lastSeenAt,
    lastStatus: connection.health.lastStatus,
  };
}

export type AgentConnectionInfo = MarkAgentStatus & {
  runnerConfigured: boolean;
  tokenConfigured: boolean;
};

export async function getAgentConnectionInfoAction(): Promise<AgentConnectionInfo> {
  await requireOperator();

  const connection = await resolveAgentConnection();
  const status = await getMarkAgentStatusAction();
  const dbTokenConfigured = isSupabaseAdminConfigured()
    ? await hasActiveAgentTokens(getSupabaseAdminClient()).catch(() => false)
    : false;

  return {
    ...status,
    runnerConfigured: Boolean(connection.webhookUrl && connection.enabled),
    tokenConfigured: Boolean(process.env.HERMES_AGENT_API_TOKEN?.trim()) || dbTokenConfigured,
  };
}

export type AgentTestResult = {
  ok: boolean;
  status: "ok" | "error" | "unreachable";
  roundTripMs: number;
  message: string;
};

export async function testAgentConnectionAction(): Promise<AgentTestResult> {
  await requireOperator();
  const connection = await resolveAgentConnection();

  if (!connection.webhookUrl) {
    await recordTestResult({ status: "unreachable", error: "No webhook URL configured." });
    return { ok: false, status: "unreachable", roundTripMs: 0, message: "Set a webhook URL first." };
  }

  const body = JSON.stringify({
    type: "ping",
    workspaceId: connection.workspaceId,
    nonce: randomUUID(),
    at: new Date().toISOString(),
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = await resolveWebhookSecret(connection.webhookSecretRef);
  if (secret) headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const started = Date.now();

  try {
    const response = await fetch(connection.webhookUrl, { method: "POST", headers, body, signal: controller.signal });
    const roundTripMs = Date.now() - started;
    const status = response.ok ? "ok" : "error";
    await recordTestResult({ status, error: response.ok ? null : `HTTP ${response.status}` });
    return {
      ok: response.ok,
      status,
      roundTripMs,
      message: response.ok ? "Agent responded." : `Agent returned HTTP ${response.status}.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not reach the agent webhook.";
    await recordTestResult({ status: "unreachable", error: reason });
    return {
      ok: false,
      status: "unreachable",
      roundTripMs: Date.now() - started,
      message: "Could not reach the agent webhook.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type UploadTicket =
  | { ok: true; uploadUrl: string; objectPath: string; readUrl: string }
  | { ok: false; message: string };

/**
 * Mint a one-time signed URL the browser uses to upload a reference image
 * straight to GCS — image bytes never touch the app server. Operator-gated;
 * images only. Returns the read URL to display the image and hand it to Mark.
 */
export async function createMarkUploadUrlAction(filename: string, contentType: string): Promise<UploadTicket> {
  await requireOperator();
  if (!isGcsConfigured()) return { ok: false, message: "Photo storage isn't configured yet." };
  if (!contentType.startsWith("image/")) return { ok: false, message: "Only images can be attached." };
  const safe = (filename || "image").replace(/[^\w.\-]+/g, "_").slice(-80) || "image";
  const objectPath = `mark-uploads/${randomUUID()}-${safe}`;
  try {
    const { uploadUrl } = await createSignedUploadUrl(objectPath, contentType);
    const readUrl = await createSignedReadUrl(objectPath);
    return { ok: true, uploadUrl, objectPath, readUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't prepare the upload." };
  }
}

export type SimpleActionState = { ok: boolean; message: string } | null;

export async function renameThreadAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const id = String(formData.get("conversationId") ?? "").trim();
  const title = deriveThreadTitle(String(formData.get("title") ?? ""));
  if (!id) return { ok: false, message: "Missing conversation." };

  try {
    await renameConversation(id, title);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't rename the thread." };
  }
  revalidatePath("/mark");
  return { ok: true, message: "Renamed." };
}

export async function archiveThreadAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return { ok: false, message: "Missing conversation." };

  try {
    await archiveConversation(id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't archive the thread." };
  }
  revalidatePath("/mark");
  return { ok: true, message: "Archived." };
}

// Plain fire-and-forget form actions for the sidebar controls (used directly as
// <form action={...}>; they refresh via revalidatePath rather than returning state).
export async function createProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createProject({ operator: getOperatorActor(), name });
  revalidatePath("/mark");
}

export async function moveConversationForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const rawProject = String(formData.get("projectId") ?? "").trim();
  if (!conversationId) return;
  await assignConversationToProject(conversationId, rawProject || null);
  revalidatePath("/mark");
}

export async function archiveThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await archiveConversation(id);
  revalidatePath("/mark");
}

export async function unarchiveThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await unarchiveConversation(id);
  revalidatePath("/mark");
}

/** Poll the active thread for new/updated messages (drives the thinking state). */
export async function getThreadMessagesAction(conversationId: string): Promise<MarkMessage[]> {
  await requireOperator();
  if (!isSupabaseAdminConfigured() || !conversationId) return [];
  try {
    return await listMessages(conversationId);
  } catch {
    return [];
  }
}

export async function renameThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  const title = deriveThreadTitle(String(formData.get("title") ?? ""));
  if (!id) return;
  await renameConversation(id, title);
  revalidatePath("/mark");
}

export async function pinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await setConversationPinned(id, true);
  revalidatePath("/mark");
}

export async function unpinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await setConversationPinned(id, false);
  revalidatePath("/mark");
}

export async function deleteThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await deleteConversation(id);
  revalidatePath("/mark");
}

export async function renameProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("projectId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await renameProject(id, name);
  revalidatePath("/mark");
}

/** Best-effort "stop generating": drop the pending bubble so the thread settles.
 *  The client also stops polling optimistically; a late reply shows on next refresh. */
export async function cancelReplyAction(conversationId: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = conversationId.trim();
  if (!id) return;
  await cancelPendingMarkMessage(id).catch(() => undefined);
  revalidatePath("/mark");
}

export async function setMarkMessageFeedbackAction(
  messageId: string,
  value: "up" | "down" | null,
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = messageId.trim();
  if (!id) return;
  await setMarkMessageFeedback(id, value).catch(() => undefined);
  revalidatePath("/mark");
}

/** Re-run the operator turn that produced `markMessageId`: enqueue a fresh task
 *  and pending bubble for the preceding operator message. Best-effort. */
export async function regenerateMarkReplyAction(
  conversationId: string,
  markMessageId: string,
  opts?: { mode?: MarkMode; route?: MarkRoute },
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const convId = conversationId.trim();
  if (!convId) return;

  const client = getSupabaseAdminClient();
  let messages;
  try {
    messages = await listMessages(convId, client);
  } catch {
    return;
  }
  const idx = messages.findIndex((m) => m.id === markMessageId);
  const slice = idx === -1 ? messages : messages.slice(0, idx);
  const lastOperator = [...slice].reverse().find((m) => m.role === "operator");
  if (!lastOperator) return;

  // Prefer the settings the original turn was sent with; fall back to the caller's
  // current selection, then validated defaults.
  const mode = parseMarkMode(lastOperator.mode ?? opts?.mode);
  const route = parseMarkRoute(lastOperator.route ?? opts?.route);

  const operator = getOperatorActor();
  const settings = await getAppSettings();
  const agentName = await getAgentName();
  try {
    const agentTaskId = await enqueueMarkChatTask(
      {
        conversationId: convId,
        messageId: lastOperator.id,
        message: lastOperator.body,
        mentions: lastOperator.mentions,
        operator,
        route,
        mode,
        assistantTone: settings.assistantTone,
        assistantResponseStyle: settings.assistantResponseStyle,
        approvalStrictness: settings.approvalStrictness,
        agentName,
      },
      client,
    );
    await insertPendingMarkMessage({ conversationId: convId, agentTaskId }, client);
    const regenWakeContext = await loadWakeContext(convId, { excludeId: lastOperator.id }, client);
    const delivered = await notifyMarkWebhook({
      messageId: lastOperator.id,
      conversationId: convId,
      projectId: regenWakeContext.projectId,
      campaignId: regenWakeContext.campaignId,
      agentTaskId,
      message: lastOperator.body,
      mentions: lastOperator.mentions,
      operator,
      route,
      mode,
      assistantTone: settings.assistantTone,
      assistantResponseStyle: settings.assistantResponseStyle,
      approvalStrictness: settings.approvalStrictness,
      history: regenWakeContext.history,
    });
    if (delivered) await claimChatTask(agentTaskId, client).catch(() => false);
  } catch {
    /* best-effort: leave the thread as-is if Mark can't be reached */
  }
  revalidatePath("/mark");
}

/** Load the live editable view of a draft asset for the Work Canvas. Operator-gated. */
export async function getDraftAssetAction(assetId: string): Promise<DraftAssetView | null> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return null;
  const id = assetId.trim();
  if (!id) return null;
  try {
    return await getDraftAsset(id);
  } catch {
    return null;
  }
}

export type EditDraftState = { ok: boolean; message: string };

/**
 * Persist an in-canvas edit to a draft asset (body -> edited_body, structured fields ->
 * edited_fields). Operator-gated; outbound stays locked. Revalidates Mark + Campaigns.
 */
export async function editDraftAssetAction(input: {
  assetId: string;
  campaignId: string;
  title?: string;
  body?: string;
  fields: Record<string, string>;
}): Promise<EditDraftState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const assetId = input.assetId?.trim();
  if (!assetId) return { ok: false, message: "Missing asset." };

  try {
    await editDraftAsset(
      {
        assetId,
        campaignId: input.campaignId?.trim() ?? "",
        title: input.title,
        body: input.body,
        fields: input.fields ?? {},
      },
      getOperatorActor(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the edit." };
  }

  revalidatePath("/mark");
  revalidatePath("/campaigns");
  if (input.campaignId?.trim()) revalidatePath(`/campaigns/${input.campaignId.trim()}`);
  return { ok: true, message: "Saved." };
}

const CHAT_DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

/** Approve / decline / archive a draft asset straight from a Mark action card.
 *  Wraps the campaign decision lib (works gated or ungated). Outbound stays locked. */
export async function decideCampaignDraftAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!assetId || !CHAT_DECISIONS.includes(decision as ApprovalDecision)) return;
  await decideAsset(
    { assetId, campaignId, decision: decision as ApprovalDecision, operator: getOperatorActor() },
  ).catch(() => undefined);
  revalidatePath("/mark");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

// ── Save & Promote ───────────────────────────────────────────────────────────

export type SaveItemActionInput = {
  kind: SavedKind;
  title?: string;
  body?: string;
  mediaUrl?: string;
  caption?: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceCampaignId?: string;
  sourceAssetId?: string;
};

export async function saveMarkItemAction(input: SaveItemActionInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to save items." };
  const saved = await saveItem({ operator: getOperatorActor(), ...input });
  revalidatePath("/mark/saved");
  return { ok: true, id: saved.id };
}

export async function unsaveMarkItemAction(id: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  await removeSavedItem(id, getOperatorActor());
  revalidatePath("/mark/saved");
}

export async function attachCampaignForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  if (!conversationId) return;
  await assignConversationToCampaign(conversationId, campaignId);
  revalidatePath("/mark");
}

export async function promoteSavedItemAction(
  savedItemId: string,
  target: PromoteTarget,
): Promise<{ ok: boolean; campaignId?: string; assetId?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to promote." };
  const valid = validatePromoteTarget(target);
  if (!valid.ok) return { ok: false, message: valid.message };

  const operator = getOperatorActor();
  const agentName = await getAgentName();
  const item = await getSavedItem(savedItemId, operator);
  if (!item) return { ok: false, message: "Saved item not found." };

  const campaignId =
    target.mode === "existing"
      ? target.campaignId
      : (await createCampaignShell({ operator, name: target.name, persona: target.persona, restorationFocus: target.restorationFocus, agentName })).campaignId;

  const assetType = item.kind === "media" ? "image_prompt" : "social_ad";
  const { assetId } = await promoteAssetToCampaign({
    operator,
    campaignId,
    assetType,
    title: item.title ?? `Promoted from ${agentName}`,
    body: item.body,
    mediaUrl: item.mediaUrl,
    agentName,
  });

  await markPromoted(savedItemId, { campaignId, assetId });
  revalidatePath("/campaigns");
  revalidatePath("/mark/saved");
  return { ok: true, campaignId, assetId };
}
