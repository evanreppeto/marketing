import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { markUpsertLearning } from "@/lib/arc-api/brain";

/**
 * Arc records a durable fact it learned in a chat. Upserted on the caller's `key`, so
 * re-learning the same fact refreshes that node instead of inserting a near-duplicate
 * — the runner distils overlapping windows of a conversation, so the same fact is
 * expected to arrive more than once, and recall only carries a bounded set of nodes.
 *
 * Distinct from POST /brain/nodes, which inserts blind: that one is right for a
 * genuinely new observation, this one for a fact that may already be known. `learning`
 * is non-gated, so this lands as `observed` and is recalled going forward. Read-side
 * only in the sense that matters here: nothing outbound.
 *
 *   POST /api/v1/arc/brain/learnings
 *   { "key": "chat-learning:...", "label": "...", "body": "...", "summary": "...", "confidence": 60 }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const payload = body as Record<string, unknown>;
  if (typeof payload.key !== "string" || !payload.key.trim()) {
    return fail("invalid_request", "key (non-empty string) is required — it is what makes re-learning update instead of duplicate.", 400);
  }

  try {
    const result = await markUpsertLearning(payload, { orgId: allowed.scope.orgId });
    if (!result.ok) return fail("invalid_request", result.error, 400);
    return ok({ id: result.id, kind: "learning" }, 201);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write learning.", 502);
  }
}
