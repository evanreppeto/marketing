import { NextResponse } from "next/server";

import { checkAgentBearer } from "@/lib/auth/api-token";
import { streamArcMessageReasoning } from "@/lib/arc-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Arc streams its reasoning (extended-thinking tokens) for an in-flight chat
 * reply, so the pending bubble shows the thought forming live instead of a
 * post-hoc summary. The runner posts the growing reasoning (throttled, ~every
 * 180ms) as the model thinks; this updates only `metadata.reasoning` while the
 * row is still pending. The final POST /api/v1/arc/messages flips status to
 * complete with the canonical reasoning summary. Bearer-gated like the other arc
 * routes; outbound stays locked.
 *
 *   POST /api/v1/arc/messages/{agentTaskId}/reasoning
 *   body: { reasoning: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ agentTaskId: string }> }) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set ARC_AGENT_API_TOKEN before streaming reasoning." }
        : { ok: false, status: "unauthorized", message: "Streaming reasoning requires a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to stream reasoning." },
      { status: 503 },
    );
  }

  const { agentTaskId } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = payload as { reasoning?: unknown };
  // Partial reasoning can legitimately be empty early on; only a non-string is invalid.
  if (typeof body.reasoning !== "string") {
    return NextResponse.json({ ok: false, status: "rejected", message: "reasoning (string) is required." }, { status: 400 });
  }

  try {
    await streamArcMessageReasoning({ agentTaskId, reasoning: body.reasoning });
    return NextResponse.json({ ok: true, status: "streamed" }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to stream reasoning." },
      { status: 502 },
    );
  }
}
