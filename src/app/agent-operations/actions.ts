"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type OperatorDropTarget, OPERATOR_DROP_TARGETS } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getAgentName } from "@/lib/settings/agent-name";
import { moveAgentTask } from "@/lib/arc-api";
import { runArcDemoWorkflow } from "@/lib/arc/demo-workflow";
import { runArcPartnerCampaign } from "@/lib/arc/orchestrator";
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

type ArcTaskTemplateKey = keyof typeof markTaskTemplates;

export async function runArcDemoWorkflowAction() {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const result = await runArcDemoWorkflow();

  revalidatePath("/");
  revalidatePath("/agent-operations");
  revalidatePath("/approvals");
  revalidatePath("/crm");
  revalidatePath("/persona-intelligence");

  redirect(`/agent-operations?action=arc-demo-run&approval=${result.approvalItemId}`);
}

export async function runArcPartnerCampaignAction() {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const result = await runArcPartnerCampaign();

  revalidatePath("/");
  revalidatePath("/agent-operations");
  revalidatePath("/approvals");
  revalidatePath("/crm");
  revalidatePath("/persona-intelligence");

  redirect(`/agent-operations?action=arc-run&approval=${result.approvalItemId}`);
}

export async function createArcTaskAction(formData: FormData) {
  await requireOperator();

  const taskKey = String(formData.get("taskKey") ?? "");

  if (!isArcTaskTemplateKey(taskKey)) {
    redirect("/agent-operations?action=arc-task-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const supabase = getSupabaseAdminClient();
  const agentId = await ensureArcAgent();
  const template = markTaskTemplates[taskKey];
  const agentName = await getAgentName();
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
        runner_name: "Arc",
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
    model_name: "arc-claude-agent",
    reasoning_summary: `Task queued for ${agentName}. External CLI runner has not picked it up yet.`,
    started_at: null,
    completed_at: null,
    metadata: {
      runner_name: "Arc",
      runner_location: "Mac mini",
      task_key: taskKey,
    },
  });

  revalidatePath("/");
  revalidatePath("/agent-operations");

  redirect(`/agent-operations?action=arc-task-created&task=${data.id}`);
}

type TaskPriority = "low" | "medium" | "high" | "urgent";
type CreateTaskStatus = "queued" | "running" | "blocked" | "needs_approval";
const ALLOWED_PRIORITIES = new Set<TaskPriority>(["low", "medium", "high", "urgent"]);
const ALLOWED_CREATE_STATUSES = new Set<CreateTaskStatus>(["queued", "running", "blocked", "needs_approval"]);

export async function createTaskAction(formData: FormData): Promise<void> {
  await requireOperator();

  const objective = String(formData.get("objective") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "queued").trim().toLowerCase();
  const priorityRaw = String(formData.get("priority") ?? "medium").trim().toLowerCase();
  const campaignIdForType = String(formData.get("campaignId") ?? "").trim();
  const taskType =
    String(formData.get("taskType") ?? "").trim() ||
    (campaignIdForType ? "campaign_directive" : "operator_task");
  const priority: TaskPriority = (ALLOWED_PRIORITIES as Set<string>).has(priorityRaw)
    ? (priorityRaw as TaskPriority)
    : "medium";
  const status: CreateTaskStatus = (ALLOWED_CREATE_STATUSES as Set<string>).has(statusRaw)
    ? (statusRaw as CreateTaskStatus)
    : "queued";

  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | null = null;
  if (scheduledForRaw) {
    const parsed = new Date(scheduledForRaw);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      scheduledFor = parsed.toISOString();
    }
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;

  if (objective.length === 0) {
    redirect("/agent-operations?action=arc-task-error");
  }
  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const supabase = getSupabaseAdminClient();
  const agentId = await ensureArcAgent();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_tasks")
    .insert({
      agent_id: agentId,
      status,
      priority,
      objective,
      description: objective,
      task_type: taskType,
      campaign_id: campaignId,
      scheduled_for: scheduledFor,
      started_at: status === "running" ? now : null,
      owner_kind: "human",
      owner_label: "Operator",
      driver_kind: "agent",
      driver_agent_id: agentId,
      driver_label: "Arc",
      approver_label: "Owner",
      source_type: "operator_request",
      metadata: {
        runner_name: "Arc",
        requested_from: "agent_operations_board",
        requested_at: now,
        initial_status: status,
        human_approval_required: true,
        outbound_dispatch_allowed: false,
        scheduled_for: scheduledFor,
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
    summary: objective,
    payload: {
      task_type: taskType,
      initial_status: status,
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
    run_status: status === "running" ? "running" : status === "blocked" ? "failed" : "queued",
    model_provider: "external_cli",
    model_name: "arc-claude-agent",
    reasoning_summary: scheduledFor
      ? `Task created from the board with status ${status}, scheduled to start ${scheduledFor}. External runner has not picked it up yet.`
      : `Task created from the board with status ${status}. External runner has not picked it up yet.`,
    started_at: status === "running" ? now : null,
    completed_at: null,
    metadata: { runner_name: "Arc", source: "operator_board_create", initial_status: status },
  });

  await supabase.from("agent_task_events").insert({
    task_id: data.id,
    actor_kind: "human",
    actor_label: "Operator",
    event_type: "system_event",
    title: "Ticket created",
    body: objective,
    metadata: { source: "board_create", driver: "Arc", initial_status: status, priority },
  });

  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/agent-operations");
  revalidatePath("/board");
  revalidatePath("/");
  redirect(`/agent-operations?action=arc-task-created&task=${data.id}`);
}

async function ensureArcAgent() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("agents")
    .upsert(
      {
        key: "arc",
        name: "Arc",
        description: "External Arc marketing runner for the Growth Engine, intended to run from the Mac mini via Codex OAuth or Claude Code CLI.",
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
          "Arc creates structured marketing work, guardrail results, and approval items. Arc never sends, publishes, launches, or spends without human approval.",
        metadata: {
          runner_name: "Arc",
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

function isArcTaskTemplateKey(value: string): value is ArcTaskTemplateKey {
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

  let result: Awaited<ReturnType<typeof moveAgentTask>>;
  try {
    result = await moveAgentTask(taskId, toStatus as OperatorDropTarget);
  } catch (error) {
    // Defense-in-depth: any unexpected persistence error becomes the board's
    // inline error banner instead of crashing the page with a server-error overlay.
    console.error(`moveTaskAction failed for ${taskId} -> ${toStatus}:`, error);
    return { ok: false, message: "Couldn't move the task. Please try again." };
  }
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
  revalidatePath("/board");
  revalidatePath("/");
  return { ok: true, status: toStatus as OperatorDropTarget };
}
