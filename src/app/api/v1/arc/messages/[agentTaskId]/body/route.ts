import { NextResponse } from "next/server";

import { checkAgentBearer } from "@/lib/auth/api-token";
import { streamArcMessageBody } from "@/lib/arc-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Arc streams a partial reply body for an in-flight chat reply, so the pending
 * bubble types the answer out live instead of it popping in at the end. The
 * runner posts the growing text (throttled, ~every 180ms) as the model emits
 * tokens; this updates only `body` while the row is still pending. The final
 * POST /api/v1/arc/messages flips status to complete with the canonical body.
 * Bearer-gated like the other arc routes; outbound stays locked.
 *
 *   POST /api/v1/arc/messages/{agentTaskId}/body
 *   body: { body: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ agentTaskId: string }> }) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set ARC_AGENT_API_TOKEN before streaming reply text." }
        : { ok: false, status: "unauthorized", message: "Streaming reply text requires a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to stream reply text." },
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

  const body = payload as { body?: unknown };
  // Partial body can legitimately be empty early on; only a non-string is invalid.
  if (typeof body.body !== "string") {
    return NextResponse.json({ ok: false, status: "rejected", message: "body (string) is required." }, { status: 400 });
  }

  try {
    await streamArcMessageBody({ agentTaskId, body: body.body });
    return NextResponse.json({ ok: true, status: "streamed" }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to stream reply text." },
      { status: 502 },
    );
  }
}
