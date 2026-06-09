import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { appendMarkStep } from "@/lib/mark-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Mark reports a live activity step for an in-flight chat reply. Appends to the
 * pending message's metadata.steps so the chat shows a live "what Mark is doing"
 * timeline. Bearer-gated like the other hermes routes; outbound stays locked.
 *
 *   POST /api/v1/hermes/messages/{agentTaskId}/steps
 *   body: { label: string, status?: "running" | "done" }
 */
export async function POST(request: Request, { params }: { params: Promise<{ agentTaskId: string }> }) {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN before reporting steps." }
        : { ok: false, status: "unauthorized", message: "Reporting steps requires a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to record steps." },
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

  const body = payload as { label?: unknown; status?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const status = body.status === "done" ? "done" : "running";
  if (!label) {
    return NextResponse.json({ ok: false, status: "rejected", message: "label is required." }, { status: 400 });
  }

  try {
    const applied = await appendMarkStep({ agentTaskId, label, status, at: new Date().toISOString() });
    if (!applied) {
      return NextResponse.json({ ok: false, status: "not_found", message: "No pending message for that agentTaskId." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: "recorded" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to record step." },
      { status: 502 },
    );
  }
}
