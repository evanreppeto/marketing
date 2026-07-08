import { NextResponse } from "next/server";

import { updateConversationSummary } from "@/lib/arc-chat/persistence";
import { checkAgentBearer } from "@/lib/auth/api-token";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Persist a conversation's rolling summary + the marker of the last message folded
 * into it (compaction). The runner posts this after a chat turn whose history had
 * older turns overflowing the verbatim window. Bearer-gated like the other runner
 * routes; nothing outbound — this only records compacted context.
 *
 *   POST /api/v1/arc/conversations/{id}/summary
 *   body: { summary: string, summaryThroughMessageId: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, status: auth.reason === "not_configured" ? "not_configured" : "unauthorized" },
      { status: auth.status },
    );
  }
  const { id } = await params;
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Body must be valid JSON." }, { status: 400 });
  }
  const body = payload as { summary?: unknown; summaryThroughMessageId?: unknown };
  if (typeof body.summary !== "string" || !body.summary.trim() || typeof body.summaryThroughMessageId !== "string") {
    return NextResponse.json(
      { ok: false, status: "rejected", message: "summary (non-empty string) and summaryThroughMessageId (string) are required." },
      { status: 400 },
    );
  }

  try {
    await updateConversationSummary(id, { summary: body.summary, summaryThroughMessageId: body.summaryThroughMessageId });
    return NextResponse.json({ ok: true, status: "updated" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to persist summary." },
      { status: 502 },
    );
  }
}
