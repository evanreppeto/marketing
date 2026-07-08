"use server";

import { revalidatePath } from "next/cache";

import { getArcDisplayName } from "@/lib/arc-chat/agent-config";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import {
  createConversation,
  insertOperatorMessage,
  touchConversation,
} from "@/lib/arc-chat/persistence";
import { getCreationTenancy } from "@/lib/arc-chat/sharing";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

const MAX_MESSAGE_LENGTH = 8000;

export type SendArcMessageResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

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

  try {
    const operator = await getOperatorActor();

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

    const message = await insertOperatorMessage({ conversationId, body, mentions: [] });
    await enqueueArcChatTask({
      conversationId,
      messageId: message.id,
      message: body,
      mentions: [],
      operator,
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
