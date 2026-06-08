import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import {
  completeMarkMessage,
  failMarkMessage,
  findPendingMessageByTask,
  touchConversation,
} from "@/lib/mark-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Mark (the Hermes agent) delivers a reply to an operator chat message.
 * Bearer-gated like the other /api/v1/hermes routes. Flips the pending Mark
 * message (matched by agentTaskId) to complete/failed. Outbound stays locked —
 * this only records a chat reply.
 *
 *   POST /api/v1/hermes/messages   Authorization: Bearer <HERMES_AGENT_API_TOKEN>
 *   body: { agentTaskId: string, body: string, status?: "complete"|"failed", metadata?: object }
 */
export async function POST(request: Request) {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN before delivering Mark replies." }
        : { ok: false, status: "unauthorized", message: "Mark replies require a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to record Mark replies." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = payload as { agentTaskId?: unknown; body?: unknown; status?: unknown; metadata?: unknown };
  const agentTaskId = typeof body.agentTaskId === "string" ? body.agentTaskId.trim() : "";
  const replyBody = typeof body.body === "string" ? body.body : "";
  const status = body.status === "failed" ? "failed" : "complete";

  if (!agentTaskId) {
    return NextResponse.json({ ok: false, status: "rejected", message: "agentTaskId is required." }, { status: 400 });
  }
  if (status === "complete" && !replyBody.trim()) {
    return NextResponse.json({ ok: false, status: "rejected", message: "A non-empty body is required for a completed reply." }, { status: 400 });
  }

  try {
    const pending = await findPendingMessageByTask(agentTaskId);
    if (!pending) {
      return NextResponse.json({ ok: false, status: "not_found", message: "No pending Mark message for that agentTaskId." }, { status: 404 });
    }

    if (status === "failed") {
      await failMarkMessage({ messageId: pending.id, body: replyBody.trim() || "Mark couldn't complete this reply." });
    } else {
      const metadata = body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : {};
      await completeMarkMessage({ messageId: pending.id, body: replyBody.trim(), metadata });
    }
    await touchConversation(pending.conversationId);

    return NextResponse.json({ ok: true, status: "recorded", messageId: pending.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to record Mark reply." },
      { status: 502 },
    );
  }
}
