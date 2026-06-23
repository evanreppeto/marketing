import { arcGuard, INVALID_JSON, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { getRecallMemory } from "@/lib/knowledge-graph/recall";

/**
 * The org's durable "memory" for Arc to recall this turn — trusted + observed
 * brain nodes, selected (core + keyword top-up against `message`) and enriched
 * with multi-hop relationship sub-lines from the brain's edges. The runner
 * fetches this each turn and injects it into the system prompt. Read-only.
 * `message` is optional (an empty message still returns the core set).
 *
 * Scope MUST come from arcGuard (the agent token's workspace), exactly like
 * every other /brain route. The old getCurrentOrgId() path resolved no workspace
 * for the runner's cookieless call and fell back to the DEFAULT org, so Arc
 * recalled the wrong/empty brain for any non-default workspace — and never saw
 * the notes it had just written through the (token-scoped) write routes.
 *
 *   POST /api/v1/arc/brain/recall  { message?, limit? }  ->  { ok, memory }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const message =
    typeof (payload as Record<string, unknown>).message === "string"
      ? ((payload as Record<string, unknown>).message as string)
      : "";

  try {
    const memory = await getRecallMemory(allowed.scope.orgId, message);
    return ok({ memory });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load recall memory.", 502);
  }
}
