import { getPendingArcMessage, type ArcMessage } from "@/lib/arc-chat/persistence";
import { assertConversationAccess } from "@/lib/arc-chat/sharing";
import { requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Live reply stream (Server-Sent Events) for the operator's Arc chat. Replaces
 * interval polling: while a reply is in flight the client opens one long-lived
 * connection and this route pushes the growing body / reasoning / steps as they
 * land, then a terminal `done` event once the reply completes so the client
 * reconciles the canonical message (with its action cards, recall, etc.).
 *
 * Operator-authed (session cookie), NOT bearer — this is the browser seam, unlike
 * the runner's /api/v1/arc/* callbacks. Read-only; outbound stays locked.
 *
 *   GET /api/arc/stream/{conversationId}   ->  text/event-stream
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound below the platform function ceiling; the loop self-closes at MAX_STREAM_MS
// and the browser's EventSource transparently reconnects to resume.
export const maxDuration = 60;

const POLL_MS = 400;
const MAX_STREAM_MS = 45_000;
const HEARTBEAT_MS = 15_000;

function sseFrame(event: string | null, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `${event ? `event: ${event}\n` : ""}data: ${payload}\n\n`;
}

/** A cheap change key: body/reasoning only grow, steps change count or status. */
function fingerprint(message: ArcMessage): string {
  return `${message.body.length}|${(message.reasoning ?? "").length}|${(message.steps ?? [])
    .map((step) => `${step.label}:${step.status}`)
    .join(",")}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  await requireOperator();
  const { conversationId } = await params;

  if (!isSupabaseAdminConfigured()) {
    return new Response("stream unavailable", { status: 503 });
  }

  try {
    await assertConversationAccess(conversationId, "view");
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const abort = () => {
        closed = true;
      };
      request.signal.addEventListener("abort", abort);

      // Opening comment flushes headers and defeats proxy response buffering.
      send(": connected\n\n");
      let lastFingerprint: string | null = null;
      let lastActivity = Date.now();

      try {
        while (!closed && Date.now() - startedAt < MAX_STREAM_MS) {
          let pending: ArcMessage | null | undefined;
          try {
            pending = await getPendingArcMessage(conversationId);
          } catch {
            // Transient read error — keep the connection and retry next tick.
            pending = undefined;
          }

          if (pending === null) {
            // Nothing in flight: the reply completed (or none exists). Tell the
            // client to pull the canonical message, then end this stream.
            send(sseFrame("done", { conversationId }));
            break;
          }

          if (pending) {
            const fp = fingerprint(pending);
            if (fp !== lastFingerprint) {
              lastFingerprint = fp;
              lastActivity = Date.now();
              send(
                sseFrame(null, {
                  messageId: pending.id,
                  body: pending.body,
                  reasoning: pending.reasoning ?? null,
                  steps: pending.steps,
                  status: "pending",
                }),
              );
            }
          }

          if (Date.now() - lastActivity >= HEARTBEAT_MS) {
            lastActivity = Date.now();
            send(": ping\n\n"); // keep idle connections alive through proxies
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } finally {
        request.signal.removeEventListener("abort", abort);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
