"use server";

import { createHmac, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createSignedReadUrl, createSignedUploadUrl, isGcsConfigured } from "@/lib/storage/gcs";

import { deriveThreadTitle, parseArcMode, parseArcRoute, parseMentions, validateArcMessageInput, ArcMessageError, type ArcMode, type ArcRoute } from "@/domain";
import { resolveAgentConnection } from "@/lib/agent/connection";
import { recordTestResult } from "@/lib/agent/health";
import { resolveWebhookSecret } from "@/lib/agent/secret";
import { skillIdForArcCommand } from "@/lib/arc-skills/catalog";
import { hasActiveAgentTokens } from "@/lib/agent/tokens";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import { getArcDisplayName, isAgentLive } from "@/lib/arc-chat/agent-config";
import { claimChatTask } from "@/lib/arc-chat/inbox";
import { loadWakeContext } from "@/lib/arc-chat/history";
import { notifyArcWebhook } from "@/lib/arc-chat/notify";
import { logArcChatStatus } from "@/lib/arc-chat/status-log";
import { isAcceptedAttachment } from "@/lib/arc-chat/attachment-types";
import { getAppSettings } from "@/lib/settings/store";
import { getAgentName } from "@/lib/settings/agent-name";
import {
  archiveConversation,
  assignConversationToCampaign,
  assignConversationToProject,
  cancelPendingArcMessage,
  createConversation,
  createProject,
  deleteConversation,
  deleteProject,
  insertFailedArcMessage,
  insertOperatorMessage,
  insertPendingArcMessage,
  getMessageConversationId,
  listActiveArcRunConversationIds,
  listMessages,
  listRecentArcRuns,
  type ActiveArcRun,
  type ArcRun,
  parseArcAttachmentsJson,
  renameConversation,
  renameProject,
  setConversationPinned,
  setArcMessageFeedback,
  touchConversation,
  unarchiveConversation,
  updateOperatorMessageBody,
  type ArcMessage,
} from "@/lib/arc-chat/persistence";
import { type ApprovalDecision, decideAsset } from "@/lib/campaigns/decisions";
import { editDraftAsset, getDraftAsset, type DraftAssetView } from "@/lib/campaigns/draft-editing";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { saveItem, removeSavedItem, getSavedItem, markPromoted, type SavedKind } from "@/lib/arc-chat/saved";
import { assertConversationAccess, assertProjectAccess, getCreationTenancy, getShareViewer, resolveConversationAccess, ArcAccessError } from "@/lib/arc-chat/sharing";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { type ArcChatTaskScope } from "@/lib/arc-chat/inbox";
import { validatePromoteTarget, type PromoteTarget } from "./promote-target";

export type SendMessageState = { ok: boolean; message: string; conversationId?: string } | null;

/**
 * Operator sends Arc a message. Persists the message, enqueues an agent_task,
 * and drops a pending Arc bubble that the callback later completes. Creates the
 * conversation on the first message. No live AI; outbound stays locked.
 */
export async function sendArcMessageAction(_previous: SendMessageState, formData: FormData): Promise<SendMessageState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    const agentName = await getAgentName();
    return { ok: false, message: `Supabase isn't configured yet, so ${agentName} can't receive the message.` };
  }

  const rawBody = String(formData.get("body") ?? "");
  const mentions = parseMentions(String(formData.get("mentions") ?? "[]"));
  const mode = parseArcMode(formData.get("mode"));
  const route = parseArcRoute(formData.get("route"));
  const settings = await getAppSettings();
  // Structured slash command (e.g. "find-leads"); travels to the agent as real
  // intent alongside the message + mentions, not just text.
  const command = String(formData.get("command") ?? "").trim() || null;
  const skillId = skillIdForArcCommand(command);
  // Operator-uploaded reference images (already in GCS); travel to Arc as context.
  const attachments = parseArcAttachmentsJson(String(formData.get("attachments") ?? "[]"));
  let body: string;
  let cleanMentions = mentions;
  try {
    const effectiveBody = rawBody.trim() === "" && attachments.length > 0 ? "Shared an image for reference." : rawBody;
    const validated = validateArcMessageInput({ body: effectiveBody, mentions });
    body = validated.body;
    cleanMentions = validated.mentions;
  } catch (error) {
    if (error instanceof ArcMessageError) return { ok: false, message: error.message };
    throw error;
  }

  const operator = await getOperatorActor();
  const client = getSupabaseAdminClient();
  const existingId = String(formData.get("conversationId") ?? "").trim();
  // Optional project chosen in the composer footer — assigned on a new thread.
  const projectId = String(formData.get("projectId") ?? "").trim() || null;

  // Resolve the viewer once; used for authorship stamping and access gating.
  const viewer = await getShareViewer(client);

  // For an existing conversation, assert collaborate access before inserting.
  if (existingId) {
    try {
      await assertConversationAccess(existingId, "collaborate", viewer, client);
    } catch (error) {
      if (error instanceof ArcAccessError) {
        const agentName = await getAgentName();
        return { ok: false, message: `This chat is view-only — ${agentName} can't accept a message here.` };
      }
      throw error;
    }
  }

  let conversationId = existingId;
  let messageId: string;
  try {
    if (!conversationId) {
      const tenancy = await getCreationTenancy();
      const conversation = await createConversation(
        { operator, title: deriveThreadTitle(body), projectId, ...tenancy },
        client,
      );
      conversationId = conversation.id;
    }
    const operatorMessage = await insertOperatorMessage(
      { conversationId, body, mentions: cleanMentions, attachments, mode, route, command, skillId, author_user_id: viewer.userId },
      client,
    );
    messageId = operatorMessage.id;
    await touchConversation(conversationId, client);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save your message." };
  }

  // Event-driven (Telegram-style): enqueue the task, drop a pending bubble, then
  // POST a small wake to Arc's webhook so it processes just this message and
  // sleeps. Routine chat rides the cheap/fast model route. Outbound stays locked.
  // If Arc isn't connected, record a failed reply so the thread shows what
  // happened instead of hanging on "thinking".
  const agentName = await getAgentName();
  try {
    const agentTaskId = await enqueueArcChatTask(
      {
        conversationId,
        messageId,
        message: body,
        mentions: cleanMentions,
        operator,
        route,
        mode,
        command,
        skillId,
        assistantTone: settings.assistantTone,
        assistantResponseStyle: settings.assistantResponseStyle,
        approvalStrictness: settings.approvalStrictness,
        attachments,
        agentName,
      },
      client,
    );
    await insertPendingArcMessage({ conversationId, agentTaskId }, client);
    logArcChatStatus("queued", { agentTaskId, conversationId });
    // Wake Arc (push). Best-effort — never blocks or fails the send. On a
    // delivered wake we claim the task (queued -> running) so the inbox poll
    // won't hand the same message out again; a missed wake stays queued for it.
    logArcChatStatus("waking_mark", { agentTaskId, conversationId });
    const wakeContext = await loadWakeContext(conversationId, { excludeId: messageId }, client);
    const delivered = await notifyArcWebhook({
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
      skillId,
      attachments,
      history: wakeContext.history,
    });
    if (delivered) {
      const claimed = await claimChatTask(agentTaskId, client).catch(() => false);
      if (claimed) logArcChatStatus("processing", { agentTaskId, conversationId, detail: "via=wake" });
    }
  } catch (error) {
    await insertFailedArcMessage(
      { conversationId, body: error instanceof Error ? error.message : `${agentName} couldn't be reached.` },
      client,
    ).catch(() => undefined);
  }

  // Only revalidate when the message landed in the thread the user is already
  // viewing. For a brand-new conversation the client immediately pushes to
  // /arc?c=<id> (a fresh dynamic render); revalidating here would re-render
  // the bare /arc hero underneath the in-flight navigation — a visible flash
  // back to "What should Arc work on?" between send and thread.
  if (existingId) revalidatePath("/arc");
  return { ok: true, message: "Sent.", conversationId };
}

export type ArcAgentStatus = {
  attached: boolean;
  name: string;
  lastSeenAt: string | null;
  lastStatus: "ok" | "error" | "unreachable" | null;
};

/**
 * Connection signal for the Arc header: is an agent actually attached and live?
 * Judged by a recent ok heartbeat — recordAgentSeen() stamps last_seen_at on every
 * authenticated /api/v1/arc call (the poller's poll, a realtime reply, a webhook
 * test), so this is true whether the agent is wired via realtime, polling, or a
 * webhook, and does not depend on a configured runner URL or agent-key naming. When
 * false, sends still queue for pickup — the UI says so plainly.
 */
export async function getArcAgentStatusAction(): Promise<ArcAgentStatus> {
  const connection = await resolveAgentConnection();
  const name = await getArcDisplayName();
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

export type AgentConnectionInfo = ArcAgentStatus & {
  runnerConfigured: boolean;
  tokenConfigured: boolean;
};

export async function getAgentConnectionInfoAction(): Promise<AgentConnectionInfo> {
  await requireOperator();

  const connection = await resolveAgentConnection();
  const status = await getArcAgentStatusAction();
  const dbTokenConfigured = isSupabaseAdminConfigured()
    ? await hasActiveAgentTokens(getSupabaseAdminClient()).catch(() => false)
    : false;

  return {
    ...status,
    runnerConfigured: Boolean(connection.webhookUrl && connection.enabled),
    tokenConfigured: Boolean(process.env.ARC_AGENT_API_TOKEN?.trim()) || dbTokenConfigured,
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
 * Mint a one-time signed URL the browser uses to upload a file (image, PDF,
 * or text) straight to GCS — bytes never touch the app server. Operator-gated.
 * Returns the read URL to display/reference the attachment and hand it to Arc.
 */
export async function createArcUploadUrlAction(filename: string, contentType: string): Promise<UploadTicket> {
  await requireOperator();
  if (!isGcsConfigured()) return { ok: false, message: "Photo storage isn't configured yet." };
  if (!isAcceptedAttachment(contentType)) {
    return { ok: false, message: "Unsupported file. Attach an image, PDF, or text file." };
  }
  const safe = (filename || "file").replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const objectPath = `arc-uploads/${randomUUID()}-${safe}`;
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
    await assertConversationAccess(id, "collaborate");
    await renameConversation(id, title);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't rename the thread." };
  }
  revalidatePath("/arc");
  return { ok: true, message: "Renamed." };
}

export async function archiveThreadAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return { ok: false, message: "Missing conversation." };

  try {
    await assertConversationAccess(id, "collaborate");
    await archiveConversation(id);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't archive the thread." };
  }
  revalidatePath("/arc");
  return { ok: true, message: "Archived." };
}

// Plain fire-and-forget form actions for the sidebar controls (used directly as
// <form action={...}>; they refresh via revalidatePath rather than returning state).
export async function createProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const tenancy = await getCreationTenancy();
  await createProject({ operator: await getOperatorActor(), name, ...tenancy });
  revalidatePath("/arc");
}

export async function moveConversationForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const rawProject = String(formData.get("projectId") ?? "").trim();
  if (!conversationId) return;
  await assertConversationAccess(conversationId, "collaborate");
  await assignConversationToProject(conversationId, rawProject || null);
  revalidatePath("/arc");
}

export async function archiveThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await archiveConversation(id);
  revalidatePath("/arc");
}

export async function unarchiveThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await unarchiveConversation(id);
  revalidatePath("/arc");
}

/** Poll the active thread for new/updated messages (drives the thinking state). */
export async function getThreadMessagesAction(conversationId: string): Promise<ArcMessage[]> {
  await requireOperator();
  if (!isSupabaseAdminConfigured() || !conversationId) return [];
  const viewer = await getShareViewer();
  const decision = await resolveConversationAccess(conversationId, viewer);
  if (!decision.canView) return [];
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
  await assertConversationAccess(id, "collaborate");
  await renameConversation(id, title);
  revalidatePath("/arc");
}

export async function pinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await setConversationPinned(id, true);
  revalidatePath("/arc");
}

export async function unpinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await setConversationPinned(id, false);
  revalidatePath("/arc");
}

export async function deleteThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await deleteConversation(id);
  revalidatePath("/arc");
}

export async function renameProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("projectId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await assertProjectAccess(id, "collaborate");
  await renameProject(id, name);
  revalidatePath("/arc");
}

export async function deleteProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("projectId") ?? "").trim();
  if (!id) return;
  await assertProjectAccess(id, "collaborate");
  await deleteProject(id);
  revalidatePath("/arc");
}

/** Best-effort "stop generating": drop the pending bubble so the thread settles.
 *  The client also stops polling optimistically; a late reply shows on next refresh. */
export async function cancelReplyAction(conversationId: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = conversationId.trim();
  if (!id) return;
  await assertConversationAccess(id, "collaborate");
  await cancelPendingArcMessage(id).catch(() => undefined);
  revalidatePath("/arc");
}

export async function setArcMessageFeedbackAction(
  messageId: string,
  value: "up" | "down" | null,
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = messageId.trim();
  if (!id) return;
  const conversationId = await getMessageConversationId(id);
  if (!conversationId) return;
  await assertConversationAccess(conversationId, "collaborate");
  await setArcMessageFeedback(id, value).catch(() => undefined);
  revalidatePath("/arc");
}

/** Resolve the current workspace scope for Arc-run reads, or undefined when no
 *  active workspace is available (so the caller degrades to an empty list rather
 *  than throwing). */
async function currentArcRunScope(): Promise<ArcChatTaskScope | undefined> {
  try {
    const { org_id, workspace_id } = await getCurrentAgentTaskTenantFields();
    return { orgId: org_id, workspaceId: workspace_id };
  } catch {
    return undefined;
  }
}

/** Conversation ids with an Arc run in flight — polled by the sidebar to show
 *  cross-thread "working…" indicators. Empty when Supabase isn't configured. */
export async function getActiveArcRunsAction(): Promise<ActiveArcRun[]> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return [];
  const scope = await currentArcRunScope();
  if (!scope) return [];
  return listActiveArcRunConversationIds(scope).catch(() => []);
}

/** Recent Arc runs across the active workspace — feeds the global Runs view
 *  drawer. Empty when Supabase isn't configured. */
export async function getArcRunsAction(): Promise<ArcRun[]> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return [];
  const scope = await currentArcRunScope();
  if (!scope) return [];
  return listRecentArcRuns(30, scope).catch(() => []);
}

/** Re-run the operator turn that produced `markMessageId`: enqueue a fresh task
 *  and pending bubble for the preceding operator message. Best-effort. */
export async function regenerateArcReplyAction(
  conversationId: string,
  markMessageId: string,
  opts?: { mode?: ArcMode; route?: ArcRoute },
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const convId = conversationId.trim();
  if (!convId) return;

  const client = getSupabaseAdminClient();
  await assertConversationAccess(convId, "collaborate", undefined, client);
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
  const mode = parseArcMode(lastOperator.mode ?? opts?.mode);
  const route = parseArcRoute(lastOperator.route ?? opts?.route);

  const operator = await getOperatorActor();
  const settings = await getAppSettings();
  const agentName = await getAgentName();
  const skillId = skillIdForArcCommand(lastOperator.command);
  try {
    const agentTaskId = await enqueueArcChatTask(
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
        skillId,
        agentName,
      },
      client,
    );
    await insertPendingArcMessage({ conversationId: convId, agentTaskId }, client);
    const regenWakeContext = await loadWakeContext(convId, { excludeId: lastOperator.id }, client);
    const delivered = await notifyArcWebhook({
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
      skillId,
      history: regenWakeContext.history,
    });
    if (delivered) await claimChatTask(agentTaskId, client).catch(() => false);
  } catch {
    /* best-effort: leave the thread as-is if Arc can't be reached */
  }
  revalidatePath("/arc");
}

/** Edit an operator message in place and re-run the reply from the edited text
 *  (ChatGPT-style). Updates the operator row, drops any in-flight reply, then
 *  enqueues a fresh task + pending bubble. Best-effort beyond the body update. */
export async function editAndResendArcMessageAction(
  conversationId: string,
  operatorMessageId: string,
  newBody: string,
  opts?: { mode?: ArcMode; route?: ArcRoute },
): Promise<{ ok: boolean; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "not_configured" };
  const convId = conversationId.trim();
  const msgId = operatorMessageId.trim();
  const body = newBody.trim();
  if (!convId || !msgId) return { ok: false };
  if (!body) return { ok: false, message: "Message can't be empty." };

  const client = getSupabaseAdminClient();
  try {
    await assertConversationAccess(convId, "collaborate", undefined, client);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    throw error;
  }
  let messages;
  try {
    messages = await listMessages(convId, client);
  } catch {
    return { ok: false };
  }
  const target = messages.find((m) => m.id === msgId && m.role === "operator");
  if (!target) return { ok: false };

  const updated = await updateOperatorMessageBody(msgId, body, client).catch(() => false);
  if (!updated) return { ok: false, message: "Couldn't save the edit." };

  // Drop any in-flight reply so the edit doesn't leave two pending bubbles.
  await cancelPendingArcMessage(convId).catch(() => undefined);

  const mode = parseArcMode(target.mode ?? opts?.mode);
  const route = parseArcRoute(target.route ?? opts?.route);
  const operator = await getOperatorActor();
  const settings = await getAppSettings();
  const agentName = await getAgentName();
  const skillId = skillIdForArcCommand(target.command);
  try {
    const agentTaskId = await enqueueArcChatTask(
      {
        conversationId: convId,
        messageId: target.id,
        message: body,
        mentions: target.mentions,
        operator,
        route,
        mode,
        assistantTone: settings.assistantTone,
        assistantResponseStyle: settings.assistantResponseStyle,
        approvalStrictness: settings.approvalStrictness,
        skillId,
        agentName,
      },
      client,
    );
    await insertPendingArcMessage({ conversationId: convId, agentTaskId }, client);
    const wakeContext = await loadWakeContext(convId, { excludeId: target.id }, client);
    const delivered = await notifyArcWebhook({
      messageId: target.id,
      conversationId: convId,
      projectId: wakeContext.projectId,
      campaignId: wakeContext.campaignId,
      agentTaskId,
      message: body,
      mentions: target.mentions,
      operator,
      route,
      mode,
      assistantTone: settings.assistantTone,
      assistantResponseStyle: settings.assistantResponseStyle,
      approvalStrictness: settings.approvalStrictness,
      skillId,
      history: wakeContext.history,
    });
    if (delivered) await claimChatTask(agentTaskId, client).catch(() => false);
  } catch {
    /* best-effort: the edit persisted even if Arc can't be reached right now */
  }
  revalidatePath("/arc");
  return { ok: true };
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
 * edited_fields). Operator-gated; outbound stays locked. Revalidates Arc + Campaigns.
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
      await getOperatorActor(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the edit." };
  }

  revalidatePath("/arc");
  revalidatePath("/campaigns");
  if (input.campaignId?.trim()) revalidatePath(`/campaigns/${input.campaignId.trim()}`);
  return { ok: true, message: "Saved." };
}

const CHAT_DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

/** Approve / decline / archive a draft asset straight from a Arc action card.
 *  Wraps the campaign decision lib (works gated or ungated). Outbound stays locked. */
export async function decideCampaignDraftAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!assetId || !CHAT_DECISIONS.includes(decision as ApprovalDecision)) return;
  await decideAsset(
    { assetId, campaignId, decision: decision as ApprovalDecision, operator: await getOperatorActor() },
  ).catch(() => undefined);
  revalidatePath("/arc");
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

export async function saveArcItemAction(input: SaveItemActionInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to save items." };
  const saved = await saveItem({ operator: await getOperatorActor(), ...input });
  revalidatePath("/arc/saved");
  return { ok: true, id: saved.id };
}

export async function unsaveArcItemAction(id: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  await removeSavedItem(id, await getOperatorActor());
  revalidatePath("/arc/saved");
}

export async function attachCampaignForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  if (!conversationId) return;
  await assertConversationAccess(conversationId, "collaborate");
  await assignConversationToCampaign(conversationId, campaignId);
  revalidatePath("/arc");
}

export async function promoteSavedItemAction(
  savedItemId: string,
  target: PromoteTarget,
): Promise<{ ok: boolean; campaignId?: string; assetId?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to promote." };
  const valid = validatePromoteTarget(target);
  if (!valid.ok) return { ok: false, message: valid.message };

  const operator = await getOperatorActor();
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
  revalidatePath("/arc/saved");
  return { ok: true, campaignId, assetId };
}
