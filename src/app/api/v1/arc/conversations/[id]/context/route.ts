import { NextResponse } from "next/server";

import { loadWakeContext } from "@/lib/arc-chat/history";
import { checkAgentBearer } from "@/lib/auth/api-token";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Compaction-aware conversation context for the runner: the rolling `summary` of
 * earlier turns, the recent turns verbatim (`history`), and the `overflow` of older
 * un-summarized turns to fold into the summary after replying. This is how Arc gets
 * chat memory — the runner fetches it per chat turn regardless of push/pull delivery.
 * Bearer-gated like the other runner routes.
 *
 *   GET /api/v1/arc/conversations/{id}/context?excludeMessageId=<current message id>
 *   -> { ok, history, summary, overflow }
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, status: auth.reason === "not_configured" ? "not_configured" : "unauthorized" },
      { status: auth.status },
    );
  }
  const { id } = await params;
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: true, history: [], summary: null, overflow: null });
  }
  try {
    const excludeMessageId = new URL(request.url).searchParams.get("excludeMessageId") ?? undefined;
    const ctx = await loadWakeContext(id, { excludeId: excludeMessageId });
    return NextResponse.json({ ok: true, history: ctx.history, summary: ctx.summary, overflow: ctx.overflow });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to load context." },
      { status: 502 },
    );
  }
}
