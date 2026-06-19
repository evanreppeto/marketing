import { NextResponse } from "next/server";

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { claimChatTask, listQueuedChatTasks, reclaimStaleChatTasks, settleChatTask } from "@/lib/arc-chat/inbox";
import {
  completeArcMessage,
  failArcMessage,
  findPendingMessageByTask,
  touchConversation,
} from "@/lib/arc-chat/persistence";
import { logArcChatStatus } from "@/lib/arc-chat/status-log";
import { getAgentName } from "@/lib/settings/agent-name";
import { parseMentions } from "@/domain";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Fallback inbox for the external Arc/Arc agent. The primary wake is the
 * ARC_WEBHOOK_URL push; this is the catch-up path for messages whose push
 * didn't land. Each returned task is claimed (queued -> running) before it's
 * handed out, so a message is delivered to exactly one puller and never
 * re-processed. Bearer-gated. Reply via POST (below).
 *
 *   GET /api/v1/arc/messages?limit=20   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 *   200 -> { ok: true, messages: [{ agentTaskId, conversationId, message, mentions, operator, createdAt }] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to read Arc messages." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100 ? parsedLimit : 20;

  try {
    const queued = await listQueuedChatTasks(limit, undefined, scope);
    // Claim before handing out so a message is processed exactly once, even if
    // the webhook push already woke Arc. A lost claim race just means another
    // path already took it, so drop it from this response.
    const messages = [];
    for (const item of queued) {
      if (await claimChatTask(item.agentTaskId, undefined, scope)) {
        logArcChatStatus("processing", { agentTaskId: item.agentTaskId, conversationId: item.conversationId, detail: "via=inbox" });
        messages.push(item);
      }
    }
    // Then recover anything stuck in `running` (a wake that was claimed but never
    // answered — e.g. a crashed turn), so a dropped message isn't lost forever.
    if (messages.length < limit) {
      const agentName = await getAgentName();
      messages.push(...(await reclaimStaleChatTasks({ limit: limit - messages.length, agentName }, undefined, scope)));
    }
    return NextResponse.json({ ok: true, status: "ok", messages }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to read Arc inbox." },
      { status: 502 },
    );
  }
}

/**
 * Arc (the Arc agent) delivers a reply to an operator chat message.
 * Bearer-gated like the other /api/v1/arc routes. Flips the pending Arc
 * message (matched by agentTaskId) to complete/failed. Outbound stays locked —
 * this only records a chat reply.
 *
 *   POST /api/v1/arc/messages   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 *   body: { agentTaskId: string, body: string, status?: "complete"|"failed", metadata?: object }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to record Arc replies." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = payload as {
    agentTaskId?: unknown;
    body?: unknown;
    status?: unknown;
    metadata?: unknown;
    mentions?: unknown;
  };
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
    const pending = await findPendingMessageByTask(agentTaskId, undefined, scope);
    if (!pending) {
      return NextResponse.json({ ok: false, status: "not_found", message: "No pending Arc message for that agentTaskId." }, { status: 404 });
    }

    if (status === "failed") {
      await failArcMessage({ messageId: pending.id, body: replyBody.trim() || "Arc couldn't complete this reply." });
      logArcChatStatus("failed", { agentTaskId, conversationId: pending.conversationId });
    } else {
      const metadata = body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : {};
      await completeArcMessage({
        messageId: pending.id,
        body: replyBody.trim(),
        metadata,
        // Only set mentions ("Sources Arc used") when the reply provides them.
        ...(body.mentions !== undefined ? { mentions: parseMentions(body.mentions) } : {}),
      });
      logArcChatStatus("complete", { agentTaskId, conversationId: pending.conversationId });
    }
    await touchConversation(pending.conversationId);
    // Move the queued task out of the inbox; best-effort so a settle failure
    // never masks a successfully recorded reply (a re-pull would just 404).
    await settleChatTask(agentTaskId, status === "failed" ? "failed" : "completed", undefined, scope).catch(() => undefined);

    return NextResponse.json({ ok: true, status: "recorded", messageId: pending.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to record Arc reply." },
      { status: 502 },
    );
  }
}
