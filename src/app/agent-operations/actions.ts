"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type OperatorDropTarget, OPERATOR_DROP_TARGETS } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { moveAgentTask } from "@/lib/hermes-api";
import { runHermesDemoWorkflow } from "@/lib/hermes/demo-workflow";
import { runHermesPartnerCampaign } from "@/lib/hermes/orchestrator";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const markTaskTemplates = {
  find_plumbing_partners: {
    objective: "Find plumbing partners in high-opportunity Chicago ZIP codes and prepare approval-ready recommendations.",
    taskType: "partner_lead_discovery",
    priority: "high",
    expectedOutput: "Lead list, source evidence, partner scores, persona notes, and approval cards.",
  },
  draft_property_manager_campaign: {
    objective: "Draft a property manager water-loss referral campaign brief and first approval-ready asset.",
    taskType: "campaign_brief_draft",
    priority: "medium",
    expectedOutput: "Campaign brief, audience notes, draft asset, guardrail result, and approval item.",
  },
  refresh_persona_snapshot: {
    objective: "Refresh persona intelligence for recent CRM records and recommend next best actions.",
    taskType: "persona_snapshot_refresh",
    priority: "medium",
    expectedOutput: "Persona summaries, confidence scores, risk flags, and reviewable next actions.",
  },
} as const;

type MarkTaskTemplateKey = keyof typeof markTaskTemplates;

export async function runHermesDemoWorkflowAction() {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const result = await runHermesDemoWorkflow();

  revalidatePath("/");
  revalidatePath("/agent-operations");
  revalidatePath("/approvals");
  revalidatePath("/crm");
  revalidatePath("/persona-intelligence");

  redirect(`/agent-operations?action=hermes-demo-run&approval=${result.approvalItemId}`);
}

export async function runHermesPartnerCampaignAction() {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const result = await runHermesPartnerCampaign();

  revalidatePath("/");
  revalidatePath("/agent-operations");
  revalidatePath("/approvals");
  revalidatePath("/crm");
  revalidatePath("/persona-intelligence");

  redirect(`/agent-operations?action=hermes-run&approval=${result.approvalItemId}`);
}

export async function createMarkTaskAction(formData: FormData) {
  await requireOperator();

  const taskKey = String(formData.get("taskKey") ?? "");

  if (!isMarkTaskTemplateKey(taskKey)) {
    redirect("/agent-operations?action=mark-task-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const supabase = getSupabaseAdminClient();
  const agentId = await ensureMarkAgent();
  const template = markTaskTemplates[taskKey];
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_tasks")
    .insert({
      agent_id: agentId,
      status: "queued",
      priority: template.priority,
      objective: template.objective,
      task_type: template.taskType,
      source_type: "operator_request",
      metadata: {
        runner_name: "Mark",
        requested_from: "agent_operations",
        requested_at: now,
        task_key: taskKey,
        expected_output: template.expectedOutput,
        human_approval_required: true,
        outbound_dispatch_allowed: false,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`agent_tasks insert failed: ${error.message}`);
  }

  await supabase.from("agent_task_inputs").insert({
    task_id: data.id,
    input_type: "operator_request",
    summary: template.objective,
    payload: {
      task_key: taskKey,
      expected_output: template.expectedOutput,
      guardrails: [
        "No outbound sending.",
        "Create approval items for external-facing work.",
        "Keep dispatch locked until owner approval.",
      ],
    },
  });

  await supabase.from("agent_run_logs").insert({
    task_id: data.id,
    agent_id: agentId,
    run_status: "queued",
    model_provider: "external_cli",
    model_name: "mark-mac-mini",
    reasoning_summary: "Task queued for Mark. External CLI runner has not picked it up yet.",
    started_at: null,
    completed_at: null,
    metadata: {
      runner_name: "Mark",
      runner_location: "Mac mini",
      task_key: taskKey,
    },
  });

  revalidatePath("/");
  revalidatePath("/agent-operations");

  redirect(`/agent-operations?action=mark-task-created&task=${data.id}`);
}

async function ensureMarkAgent() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("agents")
    .upsert(
      {
        key: "mark",
        name: "Mark",
        description: "External Hermes marketing runner for the Growth Engine, intended to run from the Mac mini via Codex OAuth or Claude Code CLI.",
        status: "ready",
        allowed_actions: [
          "read_queued_agent_tasks",
          "create_draft_outputs",
          "write_agent_run_logs",
          "create_approval_items",
          "recommend_next_actions",
        ],
        blocked_actions: ["send_email", "send_sms", "publish_social_post", "launch_ads", "change_ad_spend"],
        default_approval_policy: "human_required_before_outbound",
        system_instructions:
          "Mark creates structured marketing work, guardrail results, and approval items. Mark never sends, publishes, launches, or spends without human approval.",
        metadata: {
          runner_name: "Mark",
          runner_mode: "Mac mini CLI bridge pending",
          runner: "Codex OAuth or Claude Code CLI",
          autonomy_level: 2,
          kill_switch: "Outbound locked",
        },
      },
      { onConflict: "key" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }

  return data.id;
}

function isMarkTaskTemplateKey(value: string): value is MarkTaskTemplateKey {
  return value in markTaskTemplates;
}

export type MoveTaskActionResult =
  | { ok: true; status: OperatorDropTarget }
  | { ok: false; message: string };

export async function moveTaskAction(taskId: string, toStatus: string): Promise<MoveTaskActionResult> {
  await requireOperator();

  if (!(OPERATOR_DROP_TARGETS as readonly string[]).includes(toStatus)) {
    return { ok: false, message: "That column is not a valid drop target." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const result = await moveAgentTask(taskId, toStatus as OperatorDropTarget);
  if (!result.ok) {
    const message =
      result.reason === "not_found"
        ? "Task no longer exists."
        : result.code === "open_approval"
          ? "Resolve the approval in Activity before completing this task."
          : result.code === "approval_gate"
            ? "Approve this in Activity — it can't be completed straight from the board."
            : "That move isn't allowed.";
    return { ok: false, message };
  }

  revalidatePath("/agent-operations");
  revalidatePath("/");
  return { ok: true, status: toStatus as OperatorDropTarget };
}
