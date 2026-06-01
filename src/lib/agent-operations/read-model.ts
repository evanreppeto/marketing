import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const OPEN_TASK_STATUSES = new Set(["queued", "running", "needs_approval", "blocked"]);
const ACTIVE_APPROVAL_STATUSES = new Set([
  "needs_compliance",
  "needs_review",
  "pending_approval",
  "pending_owner_approval",
  "revision_requested",
]);

export type AgentOperationsMetric = {
  label: string;
  value: number | string;
  delta: string;
};

export type AgentOperationsAgent = {
  key: string;
  name: string;
  purpose: string;
  status: string;
  currentTask: string;
  riskFlags: string[];
  href: string;
};

export type AgentOperationsTask = {
  id: string;
  fullId: string;
  agentKey: string;
  agentName: string;
  task: string;
  objective: string;
  linkedObject: string;
  linkedHref: string;
  approvalHref: string | null;
  risk: string;
  approval: string;
  status: string;
  updated: string;
  href: string;
};

export type MarkRunnerStatus = {
  configured: boolean;
  agentId: string | null;
  name: string;
  status: string;
  runner: string;
  mode: string;
  lastHeartbeat: string | null;
  queuedTasks: number;
  runningTasks: number;
  blockedTasks: number;
  approvalTasks: number;
  killSwitch: string;
  nextStep: string;
};

export type AgentOperationsApproval = {
  id: string;
  source: string;
  campaign: string;
  channel: string;
  status: string;
  risk: string;
  href: string;
};

export type AgentOperationsOutput = {
  output: string;
  agent: string;
  status: string;
  time: string;
};

export type AgentOperationsDashboard =
  | {
      status: "live";
      metrics: AgentOperationsMetric[];
      agents: AgentOperationsAgent[];
      tasks: AgentOperationsTask[];
      approvals: AgentOperationsApproval[];
      recentOutputs: AgentOperationsOutput[];
      markRunner: MarkRunnerStatus;
    }
  | {
      status: "unavailable";
      message: string;
    };

type AgentRow = {
  id: string;
  key: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  allowed_actions: unknown;
  blocked_actions: unknown;
  default_approval_policy: string | null;
  metadata: unknown;
  updated_at: string | null;
};

type AgentTaskRow = {
  id: string;
  agent_id: string | null;
  status: string | null;
  priority: string | null;
  objective: string | null;
  task_type: string | null;
  source_type: string | null;
  source_id: string | null;
  campaign_id: string | null;
  approval_item_id: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: unknown;
};

export type AgentTaskDetail =
  | {
      status: "live";
      task: {
        id: string;
        status: string;
        priority: string;
        objective: string;
        taskType: string;
        sourceType: string | null;
        sourceId: string | null;
        campaignId: string | null;
        approvalItemId: string | null;
        startedAt: string | null;
        completedAt: string | null;
        createdAt: string | null;
        updatedAt: string | null;
        metadata: Record<string, unknown>;
      };
      agent: {
        id: string;
        key: string;
        name: string;
        description: string;
        status: string;
        allowedActions: string[];
        blockedActions: string[];
        approvalPolicy: string;
      };
      campaign: {
        id: string;
        name: string;
        persona: string;
        status: string;
        objective: string;
      } | null;
      approval: {
        id: string;
        itemType: string;
        status: string;
        riskLevel: string;
        href: string;
      } | null;
      inputs: Array<{
        id: string;
        inputType: string;
        sourceTable: string | null;
        sourceId: string | null;
        summary: string;
        payload: Record<string, unknown>;
      }>;
      outputs: Array<{
        id: string;
        title: string;
        outputType: string;
        body: string;
        riskLevel: string;
        complianceStatus: string;
        approvalStatus: string;
        createdAt: string | null;
      }>;
      logs: Array<{
        id: string;
        runStatus: string;
        modelProvider: string | null;
        modelName: string | null;
        reasoningSummary: string | null;
        errorMessage: string | null;
        startedAt: string | null;
        completedAt: string | null;
      }>;
    }
  | {
      status: "unavailable";
      message: string;
    }
  | {
      status: "not_found";
    };

type ApprovalItemRow = {
  id: string;
  campaign_id: string | null;
  campaign_asset_id: string | null;
  item_type: string | null;
  status: string | null;
  risk_level: string | null;
  requested_by: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  draft_output: unknown;
  decision_notes: string | null;
};

type AgentOutputRow = {
  id: string;
  task_id: string | null;
  approval_item_id: string | null;
  title: string | null;
  output_type: string | null;
  risk_level: string | null;
  compliance_status: string | null;
  approval_status: string | null;
  created_at: string | null;
};

type CampaignRow = {
  id: string;
  name: string | null;
  persona: string | null;
  status: string | null;
  objective: string | null;
};

export async function getAgentOperationsDashboard(client?: SupabaseClient): Promise<AgentOperationsDashboard> {
  if (!client && !isSupabaseAdminConfigured()) {
    return {
      status: "unavailable",
      message: "Supabase env vars are not configured.",
    };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const [agentsResult, tasksResult, approvalsResult, outputsResult, campaignsResult] = await Promise.all([
      supabase
        .from("agents")
        .select("id,key,name,description,status,allowed_actions,blocked_actions,default_approval_policy,metadata,updated_at")
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("agent_tasks")
        .select(
          "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,completed_at,created_at,updated_at,metadata",
        )
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("approval_items")
        .select(
          "id,campaign_id,campaign_asset_id,item_type,status,risk_level,requested_by,submitted_at,reviewed_at,draft_output,decision_notes",
        )
        .order("submitted_at", { ascending: false })
        .limit(50),
      supabase
        .from("agent_outputs")
        .select("id,task_id,approval_item_id,title,output_type,risk_level,compliance_status,approval_status,created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("campaigns").select("id,name,persona,status,objective").order("updated_at", { ascending: false }).limit(50),
    ]);

    assertSupabaseResult("agents", agentsResult.error);
    assertSupabaseResult("agent_tasks", tasksResult.error);
    assertSupabaseResult("approval_items", approvalsResult.error);
    assertSupabaseResult("agent_outputs", outputsResult.error);
    assertSupabaseResult("campaigns", campaignsResult.error);

    const agents = ((agentsResult.data ?? []) as AgentRow[]).map(normalizeAgentRow);
    const tasks = ((tasksResult.data ?? []) as AgentTaskRow[]).map(normalizeTaskRow);
    const approvals = ((approvalsResult.data ?? []) as ApprovalItemRow[]).map(normalizeApprovalRow);
    const outputs = ((outputsResult.data ?? []) as AgentOutputRow[]).map(normalizeOutputRow);
    const campaigns = ((campaignsResult.data ?? []) as CampaignRow[]).map(normalizeCampaignRow);

    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const approvalById = new Map(approvals.map((approval) => [approval.id, approval]));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const activeApprovals = approvals.filter((item) => ACTIVE_APPROVAL_STATUSES.has(item.status));
    const openTasks = tasks.filter((task) => OPEN_TASK_STATUSES.has(task.status));

    return {
      status: "live",
      metrics: [
        { label: "Active agents", value: agents.filter((agent) => agent.status !== "paused").length, delta: "Supabase registry" },
        { label: "Tasks running", value: openTasks.length, delta: "Open queue" },
        { label: "Awaiting approval", value: activeApprovals.length, delta: "Human gate" },
        { label: "Blocked outputs", value: countBlocked(tasks, outputs), delta: "Guardrails visible" },
        { label: "Approved this week", value: approvals.filter((item) => item.status === "approved").length, delta: "Recent decisions" },
        { label: "Risk flags", value: countRiskFlags(approvals, outputs), delta: "Review signals" },
      ],
      agents: agents.map((agent) => mapAgent(agent, tasks)),
      tasks: tasks.slice(0, 12).map((task) => mapTask(task, agentById, campaignById, approvalById)),
      approvals: activeApprovals.slice(0, 5).map((item) => mapApproval(item, campaignById)),
      recentOutputs: outputs.slice(0, 6).map((output) => mapOutput(output, taskById, agentById)),
      markRunner: mapMarkRunner(agents, tasks),
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Agent operations are unavailable.",
    };
  }
}

export async function getAgentTaskDetail(taskId: string, client?: SupabaseClient): Promise<AgentTaskDetail> {
  if (!client && !isSupabaseAdminConfigured()) {
    return {
      status: "unavailable",
      message: "Supabase env vars are not configured.",
    };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data: taskData, error: taskError } = await supabase
      .from("agent_tasks")
      .select(
        "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,started_at,completed_at,created_at,updated_at,metadata",
      )
      .eq("id", taskId)
      .maybeSingle<AgentTaskRow & { started_at: string | null }>();

    assertSupabaseResult("agent_tasks", taskError);

    if (!taskData) {
      return { status: "not_found" };
    }

    const [agentResult, inputsResult, outputsResult, logsResult, campaignResult, approvalResult] = await Promise.all([
      supabase
        .from("agents")
        .select("id,key,name,description,status,allowed_actions,blocked_actions,default_approval_policy,metadata,updated_at")
        .eq("id", taskData.agent_id ?? "")
        .maybeSingle<AgentRow>(),
      supabase
        .from("agent_task_inputs")
        .select("id,input_type,source_table,source_id,summary,payload")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("agent_outputs")
        .select("id,title,output_type,body,risk_level,compliance_status,approval_status,created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_run_logs")
        .select("id,run_status,model_provider,model_name,reasoning_summary,error_message,started_at,completed_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false }),
      taskData.campaign_id
        ? supabase
            .from("campaigns")
            .select("id,name,persona,status,objective")
            .eq("id", taskData.campaign_id)
            .maybeSingle<CampaignRow>()
        : Promise.resolve({ data: null, error: null }),
      taskData.approval_item_id
        ? supabase
            .from("approval_items")
            .select("id,item_type,status,risk_level")
            .eq("id", taskData.approval_item_id)
            .maybeSingle<{ id: string; item_type: string | null; status: string | null; risk_level: string | null }>()
        : Promise.resolve({ data: null, error: null }),
    ]);

    assertSupabaseResult("agents", agentResult.error);
    assertSupabaseResult("agent_task_inputs", inputsResult.error);
    assertSupabaseResult("agent_outputs", outputsResult.error);
    assertSupabaseResult("agent_run_logs", logsResult.error);
    assertSupabaseResult("campaigns", campaignResult.error);
    assertSupabaseResult("approval_items", approvalResult.error);

    const agent = agentResult.data ? normalizeAgentRow(agentResult.data) : null;

    return {
      status: "live",
      task: {
        id: taskData.id,
        status: taskData.status ?? "queued",
        priority: taskData.priority ?? "medium",
        objective: taskData.objective ?? "Agent task awaiting details.",
        taskType: taskData.task_type ?? "agent_task",
        sourceType: taskData.source_type,
        sourceId: taskData.source_id,
        campaignId: taskData.campaign_id,
        approvalItemId: taskData.approval_item_id,
        startedAt: taskData.started_at,
        completedAt: taskData.completed_at,
        createdAt: taskData.created_at,
        updatedAt: taskData.updated_at,
        metadata: asRecord(taskData.metadata),
      },
      agent: {
        id: agent?.id ?? taskData.agent_id ?? "unassigned",
        key: agent?.key ?? "unassigned-agent",
        name: agent?.name ?? "Unassigned agent",
        description: agent?.description ?? "No agent record found.",
        status: agent?.status ?? "unknown",
        allowedActions: getStringArray(agent?.allowed_actions),
        blockedActions: getStringArray(agent?.blocked_actions),
        approvalPolicy: agent?.default_approval_policy ?? "owner_required",
      },
      campaign: campaignResult.data
        ? {
            id: campaignResult.data.id,
            name: campaignResult.data.name ?? "Untitled campaign",
            persona: campaignResult.data.persona ?? "Unassigned persona",
            status: campaignResult.data.status ?? "draft",
            objective: campaignResult.data.objective ?? "Campaign objective pending.",
          }
        : null,
      approval: approvalResult.data
        ? {
            id: approvalResult.data.id,
            itemType: approvalResult.data.item_type ?? "approval_item",
            status: approvalResult.data.status ?? "needs_review",
            riskLevel: approvalResult.data.risk_level ?? "medium",
            href: `/approvals?item=${approvalResult.data.id}`,
          }
        : null,
      inputs: ((inputsResult.data ?? []) as Array<Record<string, unknown>>).map((input) => ({
        id: String(input.id),
        inputType: getString(input.input_type) ?? "input",
        sourceTable: getString(input.source_table),
        sourceId: getString(input.source_id),
        summary: getString(input.summary) ?? "No input summary captured.",
        payload: asRecord(input.payload),
      })),
      outputs: ((outputsResult.data ?? []) as Array<Record<string, unknown>>).map((output) => ({
        id: String(output.id),
        title: getString(output.title) ?? "Agent output",
        outputType: getString(output.output_type) ?? "output",
        body: getString(output.body) ?? "",
        riskLevel: getString(output.risk_level) ?? "medium",
        complianceStatus: getString(output.compliance_status) ?? "pending_approval",
        approvalStatus: getString(output.approval_status) ?? "pending_approval",
        createdAt: getString(output.created_at),
      })),
      logs: ((logsResult.data ?? []) as Array<Record<string, unknown>>).map((log) => ({
        id: String(log.id),
        runStatus: getString(log.run_status) ?? "queued",
        modelProvider: getString(log.model_provider),
        modelName: getString(log.model_name),
        reasoningSummary: getString(log.reasoning_summary),
        errorMessage: getString(log.error_message),
        startedAt: getString(log.started_at),
        completedAt: getString(log.completed_at),
      })),
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Agent task detail is unavailable.",
    };
  }
}

function assertSupabaseResult(table: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${table} lookup failed: ${error.message ?? "Unknown Supabase error"}`);
  }
}

function normalizeAgentRow(row: AgentRow) {
  return {
    ...row,
    key: row.key ?? row.id,
    name: row.name ?? titleize(row.key ?? "Agent"),
    description: row.description ?? "Agent record from Supabase.",
    status: row.status ?? "ready",
  };
}

function normalizeTaskRow(row: AgentTaskRow) {
  return {
    ...row,
    status: row.status ?? "queued",
    task_type: row.task_type ?? "agent_task",
    objective: row.objective ?? "Agent task awaiting details.",
  };
}

function normalizeApprovalRow(row: ApprovalItemRow) {
  return {
    ...row,
    item_type: row.item_type ?? "approval_item",
    status: row.status ?? "needs_review",
    risk_level: row.risk_level ?? "low",
  };
}

function normalizeOutputRow(row: AgentOutputRow) {
  return {
    ...row,
    output_type: row.output_type ?? "agent_output",
    risk_level: row.risk_level ?? "low",
    compliance_status: row.compliance_status ?? "pending",
    approval_status: row.approval_status ?? "draft",
  };
}

function normalizeCampaignRow(row: CampaignRow) {
  return {
    ...row,
    name: row.name ?? "Untitled campaign",
    persona: row.persona ?? "Unassigned persona",
    status: row.status ?? "draft",
    objective: row.objective ?? "Campaign objective pending.",
  };
}

function mapAgent(agent: ReturnType<typeof normalizeAgentRow>, tasks: ReturnType<typeof normalizeTaskRow>[]): AgentOperationsAgent {
  const agentTasks = tasks.filter((task) => task.agent_id === agent.id);
  const currentTask = agentTasks.find((task) => OPEN_TASK_STATUSES.has(task.status)) ?? agentTasks[0];
  const metadata = asRecord(agent.metadata);
  const riskFlags = getStringArray(metadata.risk_flags);

  return {
    key: agent.key,
    name: agent.name,
    purpose: agent.description,
    status: titleize(agent.status),
    currentTask: currentTask?.objective ?? "No active task assigned.",
    riskFlags: riskFlags.length > 0 ? riskFlags : [agent.default_approval_policy ?? "Approval policy pending"],
    href: "/agent-operations",
  };
}

function mapTask(
  task: ReturnType<typeof normalizeTaskRow>,
  agentById: Map<string, ReturnType<typeof normalizeAgentRow>>,
  campaignById: Map<string, ReturnType<typeof normalizeCampaignRow>>,
  approvalById: Map<string, ReturnType<typeof normalizeApprovalRow>>,
): AgentOperationsTask {
  const agent = task.agent_id ? agentById.get(task.agent_id) : undefined;
  const campaign = task.campaign_id ? campaignById.get(task.campaign_id) : undefined;
  const approval = task.approval_item_id ? approvalById.get(task.approval_item_id) : undefined;
  const metadata = asRecord(task.metadata);
  const risk = approval?.risk_level ?? getString(metadata.risk_level) ?? getString(metadata.risk) ?? "Low";

  return {
    id: shortId(task.id),
    fullId: task.id,
    agentKey: agent?.key ?? task.agent_id ?? "unassigned-agent",
    agentName: agent?.name ?? "Unassigned agent",
    task: titleize(task.task_type),
    objective: task.objective,
    linkedObject: campaign
      ? `Campaign: ${campaign.name}`
      : [task.source_type, task.source_id].filter(Boolean).join(": ") || "No linked record",
    linkedHref: task.approval_item_id ? `/approvals?item=${task.approval_item_id}` : campaign ? "/campaigns" : "/agent-operations",
    approvalHref: task.approval_item_id ? `/approvals?item=${task.approval_item_id}` : null,
    risk: titleize(risk),
    approval: task.approval_item_id ? "Owner approval required" : "Internal task",
    status: task.status,
    updated: task.updated_at ?? task.created_at ?? "Now",
    href: `/agent-operations/tasks/${task.id}`,
  };
}

function mapMarkRunner(agents: ReturnType<typeof normalizeAgentRow>[], tasks: ReturnType<typeof normalizeTaskRow>[]): MarkRunnerStatus {
  const mark = agents.find((agent) => agent.key === "mark") ?? agents.find((agent) => agent.key === "hermes");
  const markTasks = mark ? tasks.filter((task) => task.agent_id === mark.id) : [];
  const metadata = asRecord(mark?.metadata);
  const lastHeartbeat = getString(metadata.last_heartbeat_at) ?? getString(metadata.runner_last_seen_at);
  const mode = getString(metadata.runner_mode) ?? getString(metadata.runtime) ?? "Mac mini CLI bridge pending";
  const runner = getString(metadata.runner) ?? getString(metadata.runner_name) ?? "Codex OAuth or Claude Code CLI";
  const killSwitch = getString(metadata.kill_switch) ?? (mark?.status === "paused" || mark?.status === "disabled" ? "Paused" : "Outbound locked");

  return {
    configured: Boolean(mark),
    agentId: mark?.id ?? null,
    name: mark?.name ?? "Mark",
    status: mark ? titleize(mark.status) : "Pending setup",
    runner,
    mode,
    lastHeartbeat,
    queuedTasks: markTasks.filter((task) => task.status === "queued").length,
    runningTasks: markTasks.filter((task) => task.status === "running").length,
    blockedTasks: markTasks.filter((task) => task.status === "blocked" || task.status === "failed").length,
    approvalTasks: markTasks.filter((task) => task.status === "needs_approval").length,
    killSwitch,
    nextStep: mark
      ? "Start Mark on the Mac mini and have him poll queued tasks."
      : "Create Mark in Supabase from this page, then start the Mac mini runner.",
  };
}

function mapApproval(
  approval: ReturnType<typeof normalizeApprovalRow>,
  campaignById: Map<string, ReturnType<typeof normalizeCampaignRow>>,
): AgentOperationsApproval {
  const campaign = approval.campaign_id ? campaignById.get(approval.campaign_id) : undefined;

  return {
    id: approval.id,
    source: titleize(approval.item_type),
    campaign: campaign?.name ?? "No campaign attached",
    channel: titleize(approval.item_type),
    status: titleize(approval.status),
    risk: titleize(approval.risk_level),
    href: `/approvals?item=${approval.id}`,
  };
}

function mapOutput(
  output: ReturnType<typeof normalizeOutputRow>,
  taskById: Map<string, ReturnType<typeof normalizeTaskRow>>,
  agentById: Map<string, ReturnType<typeof normalizeAgentRow>>,
): AgentOperationsOutput {
  const task = output.task_id ? taskById.get(output.task_id) : undefined;
  const agent = task?.agent_id ? agentById.get(task.agent_id) : undefined;

  return {
    output: output.title ?? titleize(output.output_type),
    agent: agent?.name ?? "Agent output",
    status: titleize(output.approval_status || output.compliance_status),
    time: output.created_at ?? "Now",
  };
}

function countBlocked(tasks: ReturnType<typeof normalizeTaskRow>[], outputs: ReturnType<typeof normalizeOutputRow>[]) {
  return (
    tasks.filter((task) => task.status === "blocked").length +
    outputs.filter((output) => output.compliance_status === "blocked" || output.risk_level === "blocked").length
  );
}

function countRiskFlags(approvals: ReturnType<typeof normalizeApprovalRow>[], outputs: ReturnType<typeof normalizeOutputRow>[]) {
  const riskyApprovals = approvals.filter((approval) => !["low", "none"].includes(approval.risk_level)).length;
  const riskyOutputs = outputs.filter((output) => !["low", "none"].includes(output.risk_level)).length;

  return riskyApprovals + riskyOutputs;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) : id;
}
