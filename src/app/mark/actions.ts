"use server";

import { revalidatePath } from "next/cache";

import { deriveThreadTitle, parseMentions, validateMarkMessageInput, MarkMessageError } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { enqueueMarkChatTask } from "@/lib/mark-chat/enqueue";
import {
  archiveConversation,
  createConversation,
  insertFailedMarkMessage,
  insertOperatorMessage,
  insertPendingMarkMessage,
  listMessages,
  renameConversation,
  touchConversation,
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
  try {
    if (!conversationId) {
      const conversation = await createConversation({ operator, title: deriveThreadTitle(body) }, client);
      conversationId = conversation.id;
    }
    await insertOperatorMessage({ conversationId, body, mentions: cleanMentions }, client);
    await touchConversation(conversationId, client);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save your message." };
  }

  // Enqueue + pending bubble. If Mark isn't connected, record a failed reply so
  // the thread shows what happened instead of hanging on "thinking".
  try {
    const agentTaskId = await enqueueMarkChatTask(
      { conversationId, messageId: "", message: body, mentions: cleanMentions, operator },
      client,
    );
    await insertPendingMarkMessage({ conversationId, agentTaskId }, client);
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
