import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getRecallMemory } from "@/lib/knowledge-graph/recall";

/**
 * The org's durable "memory" for Arc to recall this turn — trusted + observed
 * brain nodes, ranked (core + keyword top-up against `message`). The runner
 * fetches this each turn and injects it into the system prompt. Read-only.
 * `message` is optional (an empty message still returns the core set).
 *
 *   POST /api/v1/arc/brain/recall  { message?, limit? }  ->  { ok, memory }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const message =
    typeof (payload as Record<string, unknown>).message === "string"
      ? ((payload as Record<string, unknown>).message as string)
      : "";

  try {
    const memory = await getRecallMemory(await getCurrentOrgId(), message);
    return ok({ memory });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load recall memory.", 502);
  }
}
