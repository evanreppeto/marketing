import {
  type AgentOperationsAgent,
  type AgentOperationsApproval,
  type AgentOperationsDashboard,
  type AgentOperationsMetric,
  type AgentOperationsOutput,
  type AgentOperationsTask,
  type ArcRunnerStatus,
} from "./read-model";

/**
 * Realistic, read-only demo dashboard for the Board page. Used when Supabase is
 * not configured (local preview, no DB) or when the live registry is empty, so
 * the kanban renders a populated BSR operating picture instead of an
 * "unavailable" card. Nothing here writes data or implies outbound sends — the
 * approval gate stays visibly separate.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const ARC = "Arc";
const OPERATOR = "Evan";

type DemoTaskSeed = {
  id: string;
  objective: string;
  task: string;
  campaign: string;
  persona: string;
  status: AgentOperationsTask["status"];
  priority: string;
  driver: "agent" | "human";
  risk: string;
  approval: boolean;
  progress?: { done: number; total: number };
  dueOffset?: number;
  scheduledOffset?: number;
  updatedOffset: number;
};

const PERSONA_LABEL: Record<string, string> = {
  persona_homeowner_emergency: "Homeowner / Emergency",
  persona_homeowner_preventative: "Homeowner / Preventative",
  persona_homeowner_rebuild: "Homeowner / Rebuild",
  persona_landlord: "Landlord",
  persona_hoa_board: "HOA Board",
  persona_property_manager: "Property Manager",
  persona_insurance_agent: "Insurance Agent",
  persona_listing_agent: "Listing Agent",
  persona_plumbing_partner: "Plumbing Partner",
  persona_hvac_roof_electrical_partner: "HVAC / Roof Partner",
  persona_gc_remodeler_partner: "GC / Remodeler Partner",
};

const TASK_SEEDS: DemoTaskSeed[] = [
  // Review / needs you
  {
    id: "demo-task-emergency-fb",
    objective: "Approve paid social set for Emergency Water Response 2026",
    task: "campaign_asset_review",
    campaign: "Emergency Water Response 2026",
    persona: "persona_homeowner_emergency",
    status: "needs_approval",
    priority: "urgent",
    driver: "agent",
    risk: "Medium",
    approval: true,
    progress: { done: 4, total: 4 },
    dueOffset: 6 * HOUR,
    updatedOffset: -25 * 60_000,
  },
  {
    id: "demo-task-landing-rebuild",
    objective: "Review landing page copy for Fire & Smoke Rebuild one-pager",
    task: "landing_page_review",
    campaign: "Fire & Smoke Rebuild",
    persona: "persona_homeowner_rebuild",
    status: "needs_approval",
    priority: "high",
    driver: "agent",
    risk: "Medium",
    approval: true,
    progress: { done: 3, total: 3 },
    dueOffset: 1 * DAY,
    updatedOffset: -2 * HOUR,
  },
  {
    id: "demo-task-pm-email",
    objective: "Approve property-manager reactivation email batch",
    task: "email_campaign_review",
    campaign: "Property Manager Reactivation",
    persona: "persona_property_manager",
    status: "needs_approval",
    priority: "high",
    driver: "human",
    risk: "Low",
    approval: true,
    progress: { done: 2, total: 2 },
    dueOffset: 1 * DAY,
    updatedOffset: -3 * HOUR,
  },
  // Working / Arc active
  {
    id: "demo-task-storm-creative",
    objective: "Generate creative variants for Spring Storm Prep 2026",
    task: "creative_generation",
    campaign: "Spring Storm Prep 2026",
    persona: "persona_homeowner_preventative",
    status: "running",
    priority: "high",
    driver: "agent",
    risk: "Low",
    approval: false,
    progress: { done: 6, total: 9 },
    updatedOffset: -8 * 60_000,
  },
  {
    id: "demo-task-mold-copy",
    objective: "Draft SMS + email copy for Mold Remediation Awareness",
    task: "copy_drafting",
    campaign: "Mold Remediation Awareness",
    persona: "persona_landlord",
    status: "running",
    priority: "medium",
    driver: "agent",
    risk: "Low",
    approval: false,
    progress: { done: 2, total: 5 },
    updatedOffset: -18 * 60_000,
  },
  {
    id: "demo-task-insurance-angle",
    objective: "Build message angles for Insurance Agent Co-Marketing",
    task: "message_angle_research",
    campaign: "Insurance Agent Co-Marketing",
    persona: "persona_insurance_agent",
    status: "running",
    priority: "medium",
    driver: "agent",
    risk: "Low",
    approval: false,
    progress: { done: 3, total: 6 },
    updatedOffset: -42 * 60_000,
  },
  // Waiting / queued + scheduled
  {
    id: "demo-task-plumbing-outreach",
    objective: "Prepare plumbing-partner referral outreach package",
    task: "partner_outreach_draft",
    campaign: "Plumbing Partner Network",
    persona: "persona_plumbing_partner",
    status: "queued",
    priority: "high",
    driver: "agent",
    risk: "Low",
    approval: false,
    dueOffset: 2 * DAY,
    updatedOffset: -1 * HOUR,
  },
  {
    id: "demo-task-storm-schedule",
    objective: "Stage Spring Storm Prep email for approved send window",
    task: "scheduled_send",
    campaign: "Spring Storm Prep 2026",
    persona: "persona_homeowner_preventative",
    status: "queued",
    priority: "medium",
    driver: "human",
    risk: "Low",
    approval: false,
    scheduledOffset: 2 * DAY,
    updatedOffset: -5 * HOUR,
  },
  {
    id: "demo-task-hoa-onepager",
    objective: "Assemble HOA board winter-burst-pipe one-pager",
    task: "asset_assembly",
    campaign: "HOA Winter Readiness",
    persona: "persona_hoa_board",
    status: "queued",
    priority: "low",
    driver: "agent",
    risk: "Low",
    approval: false,
    dueOffset: 4 * DAY,
    updatedOffset: -6 * HOUR,
  },
  {
    id: "demo-task-listing-agent",
    objective: "Draft listing-agent pre-sale moisture inspection offer",
    task: "copy_drafting",
    campaign: "Listing Agent Pre-Sale",
    persona: "persona_listing_agent",
    status: "queued",
    priority: "medium",
    driver: "agent",
    risk: "Low",
    approval: false,
    dueOffset: 3 * DAY,
    updatedOffset: -7 * HOUR,
  },
  // Blocked
  {
    id: "demo-task-blocked-claim",
    objective: "Resolve claim-language risk in Emergency Water ad headline",
    task: "compliance_revision",
    campaign: "Emergency Water Response 2026",
    persona: "persona_homeowner_emergency",
    status: "blocked",
    priority: "high",
    driver: "agent",
    risk: "High",
    approval: false,
    updatedOffset: -90 * 60_000,
  },
  {
    id: "demo-task-blocked-media",
    objective: "Awaiting approved before/after media for Mold campaign",
    task: "media_sourcing",
    campaign: "Mold Remediation Awareness",
    persona: "persona_landlord",
    status: "blocked",
    priority: "medium",
    driver: "human",
    risk: "Medium",
    approval: false,
    updatedOffset: -4 * HOUR,
  },
  // Done
  {
    id: "demo-task-done-storm-brief",
    objective: "Complete Spring Storm Prep campaign brief + audience plan",
    task: "campaign_brief",
    campaign: "Spring Storm Prep 2026",
    persona: "persona_homeowner_preventative",
    status: "completed",
    priority: "high",
    driver: "agent",
    risk: "Low",
    approval: false,
    progress: { done: 5, total: 5 },
    updatedOffset: -1 * DAY,
  },
  {
    id: "demo-task-done-emergency-launch",
    objective: "Emergency Water Response launch package approved & locked",
    task: "campaign_package",
    campaign: "Emergency Water Response 2026",
    persona: "persona_homeowner_emergency",
    status: "completed",
    priority: "urgent",
    driver: "human",
    risk: "Low",
    approval: false,
    progress: { done: 7, total: 7 },
    updatedOffset: -1 * DAY - 4 * HOUR,
  },
  {
    id: "demo-task-done-gc-partner",
    objective: "GC / remodeler partner referral sheet approved",
    task: "partner_asset",
    campaign: "GC Remodeler Partnerships",
    persona: "persona_gc_remodeler_partner",
    status: "completed",
    priority: "medium",
    driver: "agent",
    risk: "Low",
    approval: false,
    progress: { done: 3, total: 3 },
    updatedOffset: -2 * DAY,
  },
];

function buildDemoTask(seed: DemoTaskSeed): AgentOperationsTask {
  const driverIsArc = seed.driver === "agent";
  const driverLabel = driverIsArc ? ARC : OPERATOR;
  const ownerLabel = OPERATOR;

  return {
    id: seed.id.slice(0, 8),
    fullId: seed.id,
    agentKey: driverIsArc ? "arc" : "operator",
    agentName: ARC,
    task: titleize(seed.task),
    objective: seed.objective,
    linkedObject: `Campaign: ${seed.campaign}`,
    campaignLabel: seed.campaign,
    personaLabel: PERSONA_LABEL[seed.persona] ?? null,
    linkedHref: "/campaigns",
    approvalHref: seed.approval ? `/approvals?item=${seed.id}` : null,
    risk: seed.risk,
    approval: seed.approval ? "Owner approval required" : "Internal task",
    status: seed.status,
    priority: titleize(seed.priority),
    dueAt: seed.dueOffset != null ? iso(seed.dueOffset) : null,
    scheduledFor: seed.scheduledOffset != null ? iso(seed.scheduledOffset) : null,
    progress: seed.progress ?? null,
    owner: { kind: "human", label: ownerLabel },
    driver: driverIsArc
      ? { kind: "agent", label: ARC, agentId: "arc-demo" }
      : { kind: "human", label: driverLabel, agentId: null },
    approverLabel: ownerLabel,
    description: `${PERSONA_LABEL[seed.persona] ?? "Persona"} - ${seed.campaign}`,
    updated: iso(seed.updatedOffset),
    href: `/agent-operations/tasks/${seed.id}`,
  };
}

const DEMO_AGENTS: AgentOperationsAgent[] = [
  {
    key: "arc",
    name: ARC,
    purpose: "BSR lead marketing operator — finds opportunities, drafts campaigns, prepares creative.",
    status: "Ready",
    currentTask: "Generating creative variants for Spring Storm Prep 2026",
    riskFlags: ["human_required_before_outbound"],
    href: "/agent-operations/arc",
  },
];

const DEMO_APPROVALS: AgentOperationsApproval[] = [
  {
    id: "demo-task-emergency-fb",
    source: "Paid Social Set",
    campaign: "Emergency Water Response 2026",
    channel: "Paid Social",
    status: "Pending Owner Approval",
    risk: "Medium",
    href: "/approvals?item=demo-task-emergency-fb",
  },
  {
    id: "demo-task-landing-rebuild",
    source: "Landing Page",
    campaign: "Fire & Smoke Rebuild",
    channel: "Landing Page",
    status: "Needs Review",
    risk: "Medium",
    href: "/approvals?item=demo-task-landing-rebuild",
  },
  {
    id: "demo-task-pm-email",
    source: "Email Batch",
    campaign: "Property Manager Reactivation",
    channel: "Email",
    status: "Needs Review",
    risk: "Low",
    href: "/approvals?item=demo-task-pm-email",
  },
];

const DEMO_OUTPUTS: AgentOperationsOutput[] = [
  { output: "Emergency Water paid social — 4 variants (1:1, 4:5, 9:16)", agent: ARC, status: "Pending Owner Approval", time: iso(-25 * 60_000) },
  { output: "Spring Storm Prep creative set in progress", agent: ARC, status: "Draft", time: iso(-8 * 60_000) },
  { output: "Fire & Smoke Rebuild landing one-pager copy", agent: ARC, status: "Needs Review", time: iso(-2 * HOUR) },
  { output: "Mold Remediation SMS + email draft", agent: ARC, status: "Draft", time: iso(-18 * 60_000) },
  { output: "Plumbing partner referral package outline", agent: ARC, status: "Draft", time: iso(-1 * HOUR) },
];

const DEMO_ARC_RUNNER: ArcRunnerStatus = {
  configured: true,
  agentId: "arc-demo",
  name: ARC,
  status: "Ready",
  runner: "Claude Code CLI bridge",
  mode: "Preview data (Supabase not connected)",
  lastHeartbeat: iso(-3 * 60_000),
  queuedTasks: 4,
  runningTasks: 3,
  blockedTasks: 2,
  approvalTasks: 3,
  killSwitch: "Outbound locked",
  nextStep: "Connect Supabase to replace preview data with the live task queue.",
};

export function buildDemoAgentOperationsDashboard(): AgentOperationsDashboard {
  const tasks = TASK_SEEDS.map(buildDemoTask);
  const open = tasks.filter((task) => ["queued", "running", "needs_approval", "blocked"].includes(task.status));
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const scheduled = tasks.filter((task) => task.scheduledFor != null).length;
  const done = tasks.filter((task) => task.status === "completed").length;
  const inProgress = tasks.filter((task) => task.status === "running").length;
  const pending = tasks.filter((task) => task.status === "queued").length;
  const approvalGated = tasks.filter((task) => task.status === "needs_approval").length;

  const metrics: AgentOperationsMetric[] = [
    { label: "Approve gated", value: approvalGated, delta: "Needs you" },
    { label: "Pending", value: pending, delta: "Queued" },
    { label: "In progress", value: inProgress, delta: `${ARC} working` },
    { label: "Blocked", value: blocked, delta: "Needs a fix" },
    { label: "Scheduled", value: scheduled, delta: "Send window set" },
    { label: "Done", value: done, delta: "This week" },
  ];

  return {
    status: "live",
    metrics,
    agents: DEMO_AGENTS,
    tasks,
    approvals: DEMO_APPROVALS,
    recentOutputs: DEMO_OUTPUTS,
    arcRunner: { ...DEMO_ARC_RUNNER, queuedTasks: pending, runningTasks: inProgress, blockedTasks: blocked, approvalTasks: approvalGated },
  };
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
