import { type SupabaseClient } from "@supabase/supabase-js";

import { buildOpportunityPackageDrafts, type OpportunityPackageBrief } from "@/domain";
import { promoteAssetToCampaign } from "@/lib/campaigns/create";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { markOpportunityDrafted } from "./persistence";

/**
 * Execute an `arc_opportunity_draft` agent_task: turn its brief into a starter
 * package of approval-gated draft assets (email / SMS / paid / landing) on the
 * linked campaign, then flip the source opportunity to `drafted` and complete
 * the task. Deterministic + LLM-free (the copy comes from the domain templater),
 * so it runs the same inline (from the operator action), from the bearer
 * endpoint the sandbox worker polls, or from a real runner.
 *
 * Approval-safe by construction: every asset is `pending_approval` +
 * `dispatch_locked` with an `approval_items` gate (via promoteAssetToCampaign).
 * Nothing here sends, publishes, or spends.
 */

const DRAFT_TASK_TYPE = "arc_opportunity_draft";

export type ExecuteDraftResult =
  | { ok: true; status: "drafted"; taskId: string; campaignId: string; assetIds: string[] }
  | { ok: true; status: "idle" }
  | { ok: false; error: string };

type DraftTaskRow = {
  id: string;
  source_id: string | null;
  campaign_id: string | null;
  objective: string | null;
  metadata: Record<string, unknown> | null;
  org_id: string;
  workspace_id: string;
};

const TASK_COLUMNS = "id, source_id, campaign_id, objective, metadata, org_id, workspace_id";

/** Parse the brief the enqueue step stored in task metadata. Returns null when absent/malformed. */
function briefFromMetadata(metadata: Record<string, unknown> | null, fallbackTitle: string): OpportunityPackageBrief | null {
  const raw = metadata && typeof metadata === "object" ? (metadata.brief as unknown) : undefined;
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const urgency = b.urgency === "high" || b.urgency === "medium" || b.urgency === "low" ? b.urgency : "medium";
  const title = typeof b.title === "string" && b.title.trim() ? b.title : fallbackTitle;
  return {
    title,
    angle: typeof b.angle === "string" ? b.angle : "",
    personaLabel: typeof b.personaLabel === "string" ? b.personaLabel : "",
    focusLabel: typeof b.focusLabel === "string" ? b.focusLabel : "",
    urgency,
    subjectLabel: typeof b.subjectLabel === "string" ? b.subjectLabel : undefined,
  };
}

/**
 * Atomically claim one queued draft task (the given one, or the next in the
 * scope). The `status='queued'` guard on the update makes the claim race-safe:
 * a second caller that loses the race matches zero rows and gets null.
 */
async function claimDraftTask(client: SupabaseClient, orgId: string, agentTaskId?: string): Promise<DraftTaskRow | null> {
  let id = agentTaskId;
  if (!id) {
    const { data } = await client
      .from("agent_tasks")
      .select("id")
      .eq("task_type", DRAFT_TASK_TYPE)
      .eq("status", "queued")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!data?.id) return null;
    id = data.id;
  }
  const { data: claimed } = await client
    .from("agent_tasks")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("task_type", DRAFT_TASK_TYPE)
    .eq("status", "queued")
    .eq("org_id", orgId)
    .select(TASK_COLUMNS)
    .maybeSingle<DraftTaskRow>();
  return claimed ?? null;
}

export async function executeOpportunityDraftTask(opts: {
  agentTaskId?: string;
  client?: SupabaseClient;
  orgId: string;
  agentName?: string;
}): Promise<ExecuteDraftResult> {
  if (!opts.client && !isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const client = opts.client ?? getSupabaseAdminClient();
  const agentName = opts.agentName?.trim() || "Arc";

  const task = await claimDraftTask(client, opts.orgId, opts.agentTaskId);
  if (!task) return { ok: true, status: "idle" };

  try {
    const campaignId =
      task.campaign_id ?? (typeof task.metadata?.campaign_id === "string" ? (task.metadata.campaign_id as string) : null);
    if (!campaignId) throw new Error("Draft task has no linked campaign.");
    const brief = briefFromMetadata(task.metadata, task.objective ?? "Campaign draft");
    if (!brief) throw new Error("Draft task has no brief to draft from.");

    const tenant = { org_id: task.org_id, workspace_id: task.workspace_id };
    const drafts = buildOpportunityPackageDrafts(brief);

    const assetIds: string[] = [];
    for (const draft of drafts) {
      const { assetId } = await promoteAssetToCampaign({
        operator: agentName,
        campaignId,
        assetType: draft.assetType,
        title: draft.title,
        body: draft.body,
        mediaUrl: null,
        agentName,
        client,
        tenant,
      });
      assetIds.push(assetId);
    }

    // Link the campaign back + advance the opportunity to drafted. Best-effort:
    // the package already exists, so a status hiccup must not fail the run.
    if (task.source_id) {
      await markOpportunityDrafted(task.source_id, campaignId, client, { orgId: task.org_id }).catch(() => undefined);
    }

    await client
      .from("agent_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task.id);

    return { ok: true, status: "drafted", taskId: task.id, campaignId, assetIds };
  } catch (error) {
    // Release the claim to `failed` so the task doesn't sit "running" forever.
    await client
      .from("agent_tasks")
      .update({ status: "failed" })
      .eq("id", task.id)
      .then(undefined, () => undefined);
    return { ok: false, error: error instanceof Error ? error.message : "Draft run failed." };
  }
}
