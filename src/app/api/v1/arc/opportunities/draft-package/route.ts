import { revalidatePath } from "next/cache";

import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { executeOpportunityDraftTask } from "@/lib/opportunities/draft-package";

/**
 * Execute an approval-gated opportunity draft run: generate the campaign's
 * starter package (email / SMS / paid / landing) as pending-approval assets.
 * Bearer-gated (the same surface the sandbox fake worker and a real runner use).
 *
 *   POST /api/v1/arc/opportunities/draft-package
 *   { agent_task_id? }   // omit to claim + run the next queued draft task
 *   -> 200 { ok, status:"drafted", taskId, campaignId, assetIds }
 *      200 { ok, status:"idle" }              // nothing queued
 *
 * No outbound: every asset lands pending_approval + dispatch_locked.
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  const body =
    payload === INVALID_JSON || typeof payload !== "object" || payload === null ? {} : (payload as Record<string, unknown>);
  const agentTaskId = typeof body.agent_task_id === "string" && body.agent_task_id.trim() ? body.agent_task_id.trim() : undefined;

  const result = await executeOpportunityDraftTask({
    agentTaskId,
    orgId: allowed.scope.orgId,
    agentName: "Arc",
  });

  if (!result.ok) return fail("failed", result.error, 502);
  if (result.status === "idle") return ok({ ok: true, status: "idle" });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${result.campaignId}`);
  revalidatePath("/opportunities");
  return ok({ ok: true, status: "drafted", taskId: result.taskId, campaignId: result.campaignId, assetIds: result.assetIds });
}
