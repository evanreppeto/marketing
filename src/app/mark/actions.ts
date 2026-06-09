"use server";

import { revalidatePath } from "next/cache";

import { deriveThreadTitle, parseMentions, validateMarkMessageInput, MarkMessageError } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { enqueueMarkChatTask } from "@/lib/mark-chat/enqueue";
import { claimChatTask } from "@/lib/mark-chat/inbox";
import { notifyMarkWebhook } from "@/lib/mark-chat/notify";
import { logMarkChatStatus } from "@/lib/mark-chat/status-log";
import {
  archiveConversation,
  assignConversationToProject,
  cancelPendingMarkMessage,
  createConversation,
  createProject,
  deleteConversation,
  insertFailedMarkMessage,
  insertOperatorMessage,
  insertPendingMarkMessage,
  listMessages,
  renameConversation,
  renameProject,
  setConversationPinned,
  touchConversation,
  unarchiveConversation,
  type MarkMessage,
} from "@/lib/mark-chat/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type SendMessageState = { ok: boolean; message: string; conversationId?: string } | null;

/**
 * Operator sends Mark a message. Persists the message, enqueues an agent_task,
 * and drops a pending Mark bubble that the callback later completes. Creates the
 * conversation on the first message. No live AI; outbound stays locked.
 */
export async function sendMarkMessageAction(_previous: SendMessageState, formData: FormData): Promise<SendMessageState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so Mark can't receive the message." };
  }

  const rawBody = String(formData.get("body") ?? "");
  const mentions = parseMentions(String(formData.get("mentions") ?? "[]"));
  let body: string;
  let cleanMentions = mentions;
  try {
    const validated = validateMarkMessageInput({ body: rawBody, mentions });
    body = validated.body;
    cleanMentions = validated.mentions;
  } catch (error) {
    if (error instanceof MarkMessageError) return { ok: false, message: error.message };
    throw error;
  }

  const operator = getOperatorActor();
  const client = getSupabaseAdminClient();
  const existingId = String(formData.get("conversationId") ?? "").trim();

  let conversationId = existingId;
  let messageId: string;
  try {
    if (!conversationId) {
      const conversation = await createConversation({ operator, title: deriveThreadTitle(body) }, client);
      conversationId = conversation.id;
    }
    const operatorMessage = await insertOperatorMessage({ conversationId, body, mentions: cleanMentions }, client);
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
  try {
    const agentTaskId = await enqueueMarkChatTask(
      { conversationId, messageId, message: body, mentions: cleanMentions, operator, route: "fast" },
      client,
    );
    await insertPendingMarkMessage({ conversationId, agentTaskId }, client);
    logMarkChatStatus("queued", { agentTaskId, conversationId });
    // Wake Mark (push). Best-effort — never blocks or fails the send. On a
    // delivered wake we claim the task (queued -> running) so the inbox poll
    // won't hand the same message out again; a missed wake stays queued for it.
    logMarkChatStatus("waking_mark", { agentTaskId, conversationId });
    const delivered = await notifyMarkWebhook({
      messageId,
      conversationId,
      agentTaskId,
      message: body,
      mentions: cleanMentions,
      operator,
      route: "fast",
    });
    if (delivered) {
      const claimed = await claimChatTask(agentTaskId, client).catch(() => false);
      if (claimed) logMarkChatStatus("processing", { agentTaskId, conversationId, detail: "via=wake" });
    }
  } catch (error) {
    await insertFailedMarkMessage(
      { conversationId, body: error instanceof Error ? error.message : "Mark couldn't be reached." },
      client,
    ).catch(() => undefined);
  }

  revalidatePath("/mark");
  return { ok: true, message: "Sent.", conversationId };
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
