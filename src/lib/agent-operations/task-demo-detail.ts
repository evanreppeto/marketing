// ---------------------------------------------------------------------------
// Per-task demo detail — the rich Arc work-ticket view used at
// /agent-operations/tasks/[taskId] when Supabase isn't configured (local
// preview, screenshots, demos). Mirrors the demo task ids the Board links to
// (TASK_SEEDS / buildDemoTask in ./demo.ts) so those tickets open into a full
// work-ticket page instead of an "unavailable" card. Read-only: every produced
// output stays behind a visible approval / outbound-locked gate. Nothing here
// implies an outbound send.
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export type DemoTaskStep = {
  id: string;
  actor: "Arc" | "Human" | "System" | "Approval";
  title: string;
  body: string;
  at: string;
  /** Marks a step still running, for the live pulse in the timeline. */
  active?: boolean;
};

export type DemoTaskInput = {
  id: string;
  label: string;
  kind: "Source record" | "Signal" | "Brief" | "Approved media" | "Reference";
  detail: string;
  href: string | null;
};

export type DemoTaskCriterion = {
  id: string;
  label: string;
  done: boolean;
};

export type DemoTaskOutput = {
  title: string;
  outputType: string;
  /** Short channel/format tag, e.g. "Landing page · 1 variant". */
  formatLabel: string;
  /** The human-readable draft body shown in the output card. */
  body: string;
  /** Headline/sub copy rendered as a stylized preview block. */
  previewHeadline: string;
  previewSub: string;
  previewCta: string;
  riskLevel: "Low" | "Medium" | "High";
  complianceStatus: string;
  approvalStatus: string;
  /** Flags surfaced on the asset (claim/redaction/etc.). */
  riskFlags: string[];
};

export type DemoTaskApprover = {
  name: string;
  role: string;
  state: "Required" | "Waiting" | "Approved";
};

export type DemoTaskDetail = {
  isDemo: true;
  id: string;
  shortId: string;
  objective: string;
  brief: string;
  taskType: string;
  status: string;
  priority: string;
  driverLabel: string;
  ownerLabel: string;
  approverLabel: string;
  campaign: { name: string; persona: string; status: string } | null;
  dueAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { done: number; total: number };
  criteria: DemoTaskCriterion[];
  inputs: DemoTaskInput[];
  output: DemoTaskOutput;
  steps: DemoTaskStep[];
  approvers: DemoTaskApprover[];
  /** Whether the produced output is gated behind owner approval. */
  approvalRequired: boolean;
  linkedRecords: Array<{ label: string; detail: string; href: string }>;
};

type DemoTaskSeed = Omit<DemoTaskDetail, "isDemo" | "shortId">;

const SEEDS: DemoTaskSeed[] = [
  {
    id: "demo-task-emergency-fb",
    objective: "Approve paid social set for Emergency Water Response 2026",
    brief:
      "Arc assembled a four-variant paid social set (1:1, 4:5, 9:16) from approved BSR before/after restoration media for the Emergency Water Response launch. Needs owner sign-off before anything is scheduled — outbound stays locked until approved.",
    taskType: "campaign_asset_review",
    status: "needs_approval",
    priority: "urgent",
    driverLabel: "Arc",
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: "Emergency Water Response 2026", persona: "Homeowner / Emergency", status: "Live" },
    dueAt: iso(6 * HOUR),
    scheduledFor: null,
    createdAt: iso(-2 * DAY),
    updatedAt: iso(-25 * 60_000),
    progress: { done: 4, total: 4 },
    criteria: [
      { id: "c1", label: "Built from approved BSR before/after media", done: true },
      { id: "c2", label: "All four aspect ratios produced (1:1, 4:5, 9:16, 16:9)", done: true },
      { id: "c3", label: "No unverifiable damage or insurance claim language", done: true },
      { id: "c4", label: "Owner approval before any scheduling", done: false },
    ],
    inputs: [
      { id: "i1", label: "Lead — Riverside basement flood", kind: "Source record", detail: "Distressed homeowner, lead score 91, water category 3.", href: "/crm/leads/demo-ewr-lead-1" },
      { id: "i2", label: "Lead — Oak Park burst supply line", kind: "Source record", detail: "Insurance-involved, urgency high, photos attached.", href: "/crm/leads/demo-ewr-lead-2" },
      { id: "i3", label: "Weather signal — regional storm cell", kind: "Signal", detail: "NWS flood watch raised demand 34% week-over-week.", href: null },
      { id: "i4", label: "Approved media — flooded basement set", kind: "Approved media", detail: "12 cleared before/after frames, owner-approved 2026-05.", href: null },
    ],
    output: {
      title: "Emergency Water paid social — 4 variants",
      outputType: "paid_social_set",
      formatLabel: "Paid social · 4 variants · 1:1 / 4:5 / 9:16 / 16:9",
      body:
        "Headline set leads with response speed and authentic restoration proof. Primary text emphasizes 24/7 dispatch and documented mitigation, with a 'Call now' CTA routing to the rapid-response intake. Each variant pairs a cleared before/after frame with a high-contrast hotline overlay.",
      previewHeadline: "Emergency Water Response. Fast.",
      previewSub: "24/7 dispatch. Documented mitigation. Crews on-site in hours, not days.",
      previewCta: "Call now",
      riskLevel: "Medium",
      complianceStatus: "needs_review",
      approvalStatus: "pending_owner_approval",
      riskFlags: ["Hotline overlay text on image — verify legibility at 9:16", "Confirm 'in hours' claim matches current dispatch SLA"],
    },
    steps: [
      { id: "s1", actor: "System", title: "Task created from storm-demand spike", body: "Opportunity inbox flagged a 34% water-damage lead surge and queued a launch-asset task.", at: iso(-2 * DAY) },
      { id: "s2", actor: "Arc", title: "Pulled approved before/after media", body: "Selected 12 cleared frames from the flooded-basement set; discarded 3 with visible house numbers for privacy.", at: iso(-2 * DAY + 3 * HOUR) },
      { id: "s3", actor: "Arc", title: "Drafted four aspect-ratio variants", body: "Generated 1:1, 4:5, 9:16, and 16:9 layouts with hotline overlay and CTA. Ran guardrail pass on claim language.", at: iso(-1 * DAY) },
      { id: "s4", actor: "Arc", title: "Flagged two items for review", body: "Surfaced overlay legibility on 9:16 and an SLA-claim check before requesting approval.", at: iso(-30 * 60_000) },
      { id: "s5", actor: "Approval", title: "Routed to owner for sign-off", body: "Outbound locked. Awaiting Evan's approval before scheduling.", at: iso(-25 * 60_000), active: true },
    ],
    approvers: [
      { name: "Evan", role: "Owner", state: "Waiting" },
      { name: "Arc", role: "Preparer", state: "Approved" },
    ],
    approvalRequired: true,
    linkedRecords: [
      { label: "Campaign", detail: "Emergency Water Response 2026", href: "/campaigns" },
      { label: "Approval item", detail: "Paid social set", href: "/approvals?item=demo-task-emergency-fb" },
    ],
  },
  {
    id: "demo-task-landing-rebuild",
    objective: "Review landing page draft",
    brief:
      "Arc drafted a Fire & Smoke Rebuild one-pager landing page for homeowners rebuilding after a structure fire. It leads with the full-rebuild walkthrough and an insurance-coordination note. Review the copy and the produced asset before it can be approved — outbound stays locked.",
    taskType: "landing_page_review",
    status: "needs_approval",
    priority: "high",
    driverLabel: "Arc",
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: "Fire & Smoke Rebuild", persona: "Homeowner / Rebuild", status: "In review" },
    dueAt: iso(1 * DAY),
    scheduledFor: null,
    createdAt: iso(-3 * DAY),
    updatedAt: iso(-2 * HOUR),
    progress: { done: 3, total: 3 },
    criteria: [
      { id: "c1", label: "Leads with the full-rebuild capability story", done: true },
      { id: "c2", label: "Uses approved fire/smoke restoration imagery", done: true },
      { id: "c3", label: "Insurance-coordination note included, no claim guarantees", done: true },
      { id: "c4", label: "Owner approval before publish", done: false },
    ],
    inputs: [
      { id: "i1", label: "Contact — Mercer Ave rebuild inquiry", kind: "Source record", detail: "Post-fire homeowner, full structural rebuild, insurance engaged.", href: "/crm/contacts/demo-ewr-contact" },
      { id: "i2", label: "Campaign brief — Fire & Smoke Rebuild", kind: "Brief", detail: "Angle: end-to-end rebuild + smoke/odor remediation in one crew.", href: "/campaigns" },
      { id: "i3", label: "Approved media — fire restoration set", kind: "Approved media", detail: "9 cleared before/after frames from completed rebuilds.", href: null },
      { id: "i4", label: "Reference — competitor one-pagers", kind: "Reference", detail: "Three regional restoration landing pages for positioning.", href: null },
    ],
    output: {
      title: "Fire & Smoke Rebuild — landing one-pager",
      outputType: "landing_page",
      formatLabel: "Landing page · 1 variant · hero + 4 sections",
      body:
        "The one-pager opens with a rebuild hero, then walks through assess → mitigate → rebuild → restore, pairs each step with approved before/after media, and closes with an insurance-coordination note and a 'Start your rebuild' inquiry form. Copy avoids any claim-payout guarantees and keeps timelines qualitative.",
      previewHeadline: "Rebuild after fire & smoke — one crew, start to finish.",
      previewSub: "Assess, mitigate, rebuild, restore. We coordinate directly with your insurer.",
      previewCta: "Start your rebuild",
      riskLevel: "Medium",
      complianceStatus: "needs_review",
      approvalStatus: "pending_owner_approval",
      riskFlags: ["Confirm before/after frames are cleared for web use", "Keep insurance-coordination note advisory, not a guarantee"],
    },
    steps: [
      { id: "s1", actor: "Human", title: "Requested a rebuild landing one-pager", body: "Evan asked Arc to turn the Fire & Smoke Rebuild brief into a single approval-ready landing page.", at: iso(-3 * DAY) },
      { id: "s2", actor: "Arc", title: "Outlined the page structure", body: "Proposed hero + four-step walkthrough + insurance note + inquiry form. Confirmed the angle against the brief.", at: iso(-3 * DAY + 2 * HOUR) },
      { id: "s3", actor: "Arc", title: "Selected approved fire restoration media", body: "Pulled 9 cleared before/after frames; mapped one to each rebuild step.", at: iso(-2 * DAY) },
      { id: "s4", actor: "Arc", title: "Drafted copy and ran guardrail pass", body: "Wrote section copy, removed two timeline guarantees, and softened the insurance language to advisory.", at: iso(-3 * HOUR) },
      { id: "s5", actor: "Approval", title: "Submitted for owner review", body: "Outbound locked. Landing page is ready for Evan to approve, request changes, or decline.", at: iso(-2 * HOUR), active: true },
    ],
    approvers: [
      { name: "Evan", role: "Owner", state: "Waiting" },
      { name: "Arc", role: "Preparer", state: "Approved" },
    ],
    approvalRequired: true,
    linkedRecords: [
      { label: "Campaign", detail: "Fire & Smoke Rebuild", href: "/campaigns" },
      { label: "Approval item", detail: "Landing page", href: "/approvals?item=demo-task-landing-rebuild" },
    ],
  },
  {
    id: "demo-task-pm-email",
    objective: "Approve property-manager reactivation email batch",
    brief:
      "Arc drafted a reactivation email batch for property managers with no mitigation activity in 12+ months, leading with response-time SLAs and a multi-unit case study. Review before approval — nothing sends until you sign off.",
    taskType: "email_campaign_review",
    status: "needs_approval",
    priority: "high",
    driverLabel: "Evan",
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: "Property Manager Reactivation", persona: "Property Manager", status: "In review" },
    dueAt: iso(1 * DAY),
    scheduledFor: null,
    createdAt: iso(-2 * DAY),
    updatedAt: iso(-3 * HOUR),
    progress: { done: 2, total: 2 },
    criteria: [
      { id: "c1", label: "Targets PM accounts inactive 12+ months", done: true },
      { id: "c2", label: "Leads with SLA + multi-unit proof", done: true },
      { id: "c3", label: "Owner approval before send", done: false },
    ],
    inputs: [
      { id: "i1", label: "Company — Lakeshore Property Group", kind: "Source record", detail: "42 units, last mitigation 14 months ago.", href: "/crm/companies/demo-cwm-company" },
      { id: "i2", label: "Contact — Facilities lead", kind: "Source record", detail: "Primary maintenance decision-maker.", href: "/crm/contacts/demo-cwm-contact" },
      { id: "i3", label: "Brief — PM reactivation angle", kind: "Brief", detail: "Lead with SLA + documented commercial restoration.", href: "/campaigns" },
    ],
    output: {
      title: "PM reactivation — email batch",
      outputType: "email_batch",
      formatLabel: "Email · 1 batch · 2 sequence steps",
      body:
        "A two-step sequence: step one reintroduces BSR with a response-time SLA and a multi-unit mitigation case study; step two offers a no-cost facilities walkthrough. Copy is account-personalized by unit count and last-service date, and routes replies to the partner handoff.",
      previewHeadline: "Faster mitigation for your portfolio.",
      previewSub: "Documented commercial restoration, response-time SLAs, one point of contact.",
      previewCta: "Book a walkthrough",
      riskLevel: "Low",
      complianceStatus: "needs_review",
      approvalStatus: "pending_owner_approval",
      riskFlags: ["Confirm unit counts before personalization merge"],
    },
    steps: [
      { id: "s1", actor: "Human", title: "Asked Arc to reactivate dormant PM accounts", body: "Evan flagged property managers with no activity in over a year.", at: iso(-2 * DAY) },
      { id: "s2", actor: "Arc", title: "Built the inactive-account segment", body: "Found 18 PM accounts past 12 months; ranked by unit count and prior revenue.", at: iso(-2 * DAY + 90 * 60_000) },
      { id: "s3", actor: "Arc", title: "Drafted the two-step sequence", body: "Wrote SLA-led copy with a multi-unit case study and a walkthrough offer; merged personalization fields.", at: iso(-4 * HOUR) },
      { id: "s4", actor: "Approval", title: "Submitted for owner approval", body: "Send window stays locked until Evan approves the batch.", at: iso(-3 * HOUR), active: true },
    ],
    approvers: [
      { name: "Evan", role: "Owner", state: "Waiting" },
      { name: "Arc", role: "Preparer", state: "Approved" },
    ],
    approvalRequired: true,
    linkedRecords: [
      { label: "Campaign", detail: "Property Manager Reactivation", href: "/campaigns" },
      { label: "Approval item", detail: "Email batch", href: "/approvals?item=demo-task-pm-email" },
    ],
  },
  {
    id: "demo-task-storm-creative",
    objective: "Generate creative variants for Spring Storm Prep 2026",
    brief:
      "Arc is producing preventative storm-prep creative variants from approved BSR media. This is in-flight work — variants will enter the approval gate as they finish. Nothing is sendable yet.",
    taskType: "creative_generation",
    status: "running",
    priority: "high",
    driverLabel: "Arc",
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: "Spring Storm Prep 2026", persona: "Homeowner / Preventative", status: "Live" },
    dueAt: null,
    scheduledFor: null,
    createdAt: iso(-1 * DAY),
    updatedAt: iso(-8 * 60_000),
    progress: { done: 6, total: 9 },
    criteria: [
      { id: "c1", label: "Nine variants across 1:1, 4:5, 9:16", done: false },
      { id: "c2", label: "Sourced only from approved storm-prep media", done: true },
      { id: "c3", label: "Guardrail pass on every finished variant", done: false },
      { id: "c4", label: "Owner approval before any go live", done: false },
    ],
    inputs: [
      { id: "i1", label: "Brief — Spring Storm Prep 2026", kind: "Brief", detail: "Preventative angle: inspect before the first front.", href: "/campaigns" },
      { id: "i2", label: "Approved media — storm-prep set", kind: "Approved media", detail: "16 cleared gutter/sump/roof readiness frames.", href: null },
      { id: "i3", label: "Signal — seasonal demand ramp", kind: "Signal", detail: "Historical booking curve starts climbing in 3 weeks.", href: null },
    ],
    output: {
      title: "Spring Storm Prep — creative set (in progress)",
      outputType: "creative_set",
      formatLabel: "Creative · 6 of 9 variants · 1:1 / 4:5 / 9:16",
      body:
        "Six of nine variants are drafted: a storm-prep checklist carousel, gutter/sump readiness statics, and a roof-inspection reel. Three remain in generation. Each finished variant pairs approved readiness media with a preventative-inspection CTA and is queued for the guardrail pass before it can request approval.",
      previewHeadline: "Beat the storm. Book your prep inspection.",
      previewSub: "Gutters, sump, roof — checked before the first big front.",
      previewCta: "Schedule prep",
      riskLevel: "Low",
      complianceStatus: "in_progress",
      approvalStatus: "draft",
      riskFlags: ["3 variants still generating — not yet guardrail-checked"],
    },
    steps: [
      { id: "s1", actor: "System", title: "Task queued from the campaign brief", body: "Spring Storm Prep needs a nine-variant creative set ahead of the seasonal ramp.", at: iso(-1 * DAY) },
      { id: "s2", actor: "Arc", title: "Loaded approved storm-prep media", body: "Pulled 16 cleared readiness frames; grouped by gutter, sump, and roof themes.", at: iso(-1 * DAY + 2 * HOUR) },
      { id: "s3", actor: "Arc", title: "Drafted the first six variants", body: "Produced a checklist carousel, four readiness statics, and a roof reel. Three more in generation.", at: iso(-40 * 60_000) },
      { id: "s4", actor: "Arc", title: "Generating remaining variants", body: "Working through the final 9:16 set; guardrail pass runs as each finishes.", at: iso(-8 * 60_000), active: true },
    ],
    approvers: [
      { name: "Evan", role: "Owner", state: "Required" },
      { name: "Arc", role: "Preparer", state: "Waiting" },
    ],
    approvalRequired: true,
    linkedRecords: [{ label: "Campaign", detail: "Spring Storm Prep 2026", href: "/campaigns" }],
  },
  {
    id: "demo-task-blocked-claim",
    objective: "Resolve claim-language risk in Emergency Water ad headline",
    brief:
      "A guardrail flagged unverifiable claim language in an Emergency Water ad headline. This ticket is blocked until the copy is revised or the claim is substantiated. Outbound stays locked.",
    taskType: "compliance_revision",
    status: "blocked",
    priority: "high",
    driverLabel: "Arc",
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: "Emergency Water Response 2026", persona: "Homeowner / Emergency", status: "Live" },
    dueAt: null,
    scheduledFor: null,
    createdAt: iso(-1 * DAY),
    updatedAt: iso(-90 * 60_000),
    progress: { done: 1, total: 3 },
    criteria: [
      { id: "c1", label: "Identify the unverifiable claim", done: true },
      { id: "c2", label: "Revise copy or substantiate the claim", done: false },
      { id: "c3", label: "Re-run guardrail pass and clear the block", done: false },
    ],
    inputs: [
      { id: "i1", label: "Flagged asset — Emergency Water 1:1 static", kind: "Reference", detail: "Headline asserts a specific response-time guarantee.", href: null },
      { id: "i2", label: "Guardrail policy — claim substantiation", kind: "Brief", detail: "No time/outcome guarantees without a backing SLA record.", href: null },
    ],
    output: {
      title: "Emergency Water headline — revision needed",
      outputType: "compliance_finding",
      formatLabel: "Compliance finding · 1 blocking issue",
      body:
        "The headline 'On-site in 60 minutes, guaranteed' asserts a specific time guarantee with no backing SLA record. Arc proposes two compliant alternatives: 'Rapid 24/7 dispatch' and 'Crews on-site in hours, not days.' The asset cannot leave draft until the claim is replaced or substantiated with a documented SLA.",
      previewHeadline: "On-site in 60 minutes, guaranteed.",
      previewSub: "Flagged: unverifiable time guarantee — replace or substantiate.",
      previewCta: "Revise copy",
      riskLevel: "High",
      complianceStatus: "blocked",
      approvalStatus: "blocked",
      riskFlags: ["Unverifiable time guarantee with no SLA record", "Blocks the linked paid social set from approval"],
    },
    steps: [
      { id: "s1", actor: "Arc", title: "Guardrail pass flagged the headline", body: "Detected a specific time-guarantee claim with no backing SLA in the asset metadata.", at: iso(-1 * DAY) },
      { id: "s2", actor: "System", title: "Asset moved to blocked", body: "The variant and its parent paid social set are held out of approval until resolved.", at: iso(-1 * DAY + 5 * 60_000) },
      { id: "s3", actor: "Arc", title: "Proposed two compliant alternatives", body: "Drafted replacement headlines that keep urgency without an unverifiable guarantee.", at: iso(-95 * 60_000) },
      { id: "s4", actor: "System", title: "Awaiting revision decision", body: "Blocked until the claim is replaced or a substantiating SLA record is attached.", at: iso(-90 * 60_000), active: true },
    ],
    approvers: [{ name: "Evan", role: "Owner", state: "Required" }],
    approvalRequired: true,
    linkedRecords: [
      { label: "Campaign", detail: "Emergency Water Response 2026", href: "/campaigns" },
      { label: "Blocks", detail: "Paid social set approval", href: "/approvals?item=demo-task-emergency-fb" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Generic coverage for the remaining Board task ids (the ones without a
// hand-authored detail above). The Board links every TASK_SEEDS id to
// /agent-operations/tasks/<id>, so each one expands into a real, coherent
// work-ticket rather than dead-ending on an "unavailable" card. Synthesized
// from a compact descriptor; still read-only and approval-gated.
// ---------------------------------------------------------------------------

type GenericSeed = {
  id: string;
  objective: string;
  taskType: string;
  status: string;
  priority: string;
  driver: "Arc" | "Evan";
  risk: "Low" | "Medium" | "High";
  approvalRequired: boolean;
  campaign: string;
  persona: string;
  campaignStatus: string;
  progress: { done: number; total: number };
  dueOffset?: number;
  scheduledOffset?: number;
  updatedOffset: number;
  output: {
    title: string;
    outputType: string;
    formatLabel: string;
    body: string;
    previewHeadline: string;
    previewSub: string;
    previewCta: string;
    approvalStatus: string;
    complianceStatus: string;
    riskFlags: string[];
  };
};

const GENERIC_SEEDS: GenericSeed[] = [
  {
    id: "demo-task-mold-copy",
    objective: "Draft SMS + email copy for Mold Remediation Awareness",
    taskType: "copy_drafting",
    status: "running",
    priority: "medium",
    driver: "Arc",
    risk: "Low",
    approvalRequired: true,
    campaign: "Mold Remediation Awareness",
    persona: "Landlord",
    campaignStatus: "In review",
    progress: { done: 2, total: 5 },
    updatedOffset: -18 * 60_000,
    output: {
      title: "Mold awareness — SMS + email draft",
      outputType: "copy_set",
      formatLabel: "Copy · SMS + email · in progress",
      body: "Short SMS nudge plus a two-paragraph email leading with hidden-moisture risk and a qualifying inspection offer. Tone is educational, not alarmist; the email routes to a qualifying landing form.",
      previewHeadline: "Worried about hidden mold?",
      previewSub: "A quick moisture inspection tells you what's really behind the wall.",
      previewCta: "Book an inspection",
      approvalStatus: "draft",
      complianceStatus: "in_progress",
      riskFlags: ["Keep health claims qualitative — no remediation guarantees"],
    },
  },
  {
    id: "demo-task-insurance-angle",
    objective: "Build message angles for Insurance Agent Co-Marketing",
    taskType: "message_angle_research",
    status: "running",
    priority: "medium",
    driver: "Arc",
    risk: "Low",
    approvalRequired: false,
    campaign: "Insurance Agent Co-Marketing",
    persona: "Insurance Agent",
    campaignStatus: "Drafting",
    progress: { done: 3, total: 6 },
    updatedOffset: -42 * 60_000,
    output: {
      title: "Insurance co-marketing — message angles",
      outputType: "message_angles",
      formatLabel: "Research · 6 angles · in progress",
      body: "Six candidate angles ranked by adjuster relevance: documentation-quality proof, fast first-notice response, single point of contact, transparent scope, and two referral-incentive framings. Three are drafted with supporting proof points.",
      previewHeadline: "Documentation your adjusters can trust.",
      previewSub: "Clean scope, fast response, one point of contact on every claim.",
      previewCta: "See the angles",
      approvalStatus: "draft",
      complianceStatus: "in_progress",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-plumbing-outreach",
    objective: "Prepare plumbing-partner referral outreach package",
    taskType: "partner_outreach_draft",
    status: "queued",
    priority: "high",
    driver: "Arc",
    risk: "Low",
    approvalRequired: true,
    campaign: "Plumbing Partner Network",
    persona: "Plumbing Partner",
    campaignStatus: "Drafting",
    progress: { done: 0, total: 4 },
    dueOffset: 2 * DAY,
    updatedOffset: -1 * HOUR,
    output: {
      title: "Plumbing partner referral — outreach package",
      outputType: "partner_package",
      formatLabel: "Partner package · queued",
      body: "A referral packet for plumbing partners: a co-branded one-pager, a warm-intro email, and a reciprocal-referral note. Queued behind the active creative work; will draft from the partner brief and approved proof media.",
      previewHeadline: "Send water damage your trusted way.",
      previewSub: "We handle mitigation; you stay the hero with your customer.",
      previewCta: "Partner with BSR",
      approvalStatus: "queued",
      complianceStatus: "pending",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-storm-schedule",
    objective: "Stage Spring Storm Prep email for approved send window",
    taskType: "scheduled_send",
    status: "queued",
    priority: "medium",
    driver: "Evan",
    risk: "Low",
    approvalRequired: true,
    campaign: "Spring Storm Prep 2026",
    persona: "Homeowner / Preventative",
    campaignStatus: "Live",
    progress: { done: 1, total: 3 },
    scheduledOffset: 2 * DAY,
    updatedOffset: -5 * HOUR,
    output: {
      title: "Spring Storm Prep email — staged for send window",
      outputType: "scheduled_email",
      formatLabel: "Email · staged · send window set",
      body: "The approved preventative-inspection email is staged for the operator-set send window. It stays locked until the window opens and the owner confirms — nothing dispatches automatically.",
      previewHeadline: "Beat the storm. Book your prep inspection.",
      previewSub: "Gutters, sump, roof — checked before the first big front.",
      previewCta: "Schedule prep",
      approvalStatus: "pending_owner_approval",
      complianceStatus: "needs_review",
      riskFlags: ["Confirm send window before the gate releases"],
    },
  },
  {
    id: "demo-task-hoa-onepager",
    objective: "Assemble HOA board winter-burst-pipe one-pager",
    taskType: "asset_assembly",
    status: "queued",
    priority: "low",
    driver: "Arc",
    risk: "Low",
    approvalRequired: true,
    campaign: "HOA Winter Readiness",
    persona: "HOA Board",
    campaignStatus: "Drafting",
    progress: { done: 0, total: 3 },
    dueOffset: 4 * DAY,
    updatedOffset: -6 * HOUR,
    output: {
      title: "HOA winter readiness — one-pager",
      outputType: "one_pager",
      formatLabel: "One-pager (PDF) · queued",
      body: "A board-ready one-pager on winter burst-pipe prevention for multi-unit communities: shut-off guidance, a vacancy checklist, and a priority-response note for HOA-managed properties.",
      previewHeadline: "Protect every unit this winter.",
      previewSub: "Burst-pipe prevention and priority response for your community.",
      previewCta: "Request the board packet",
      approvalStatus: "queued",
      complianceStatus: "pending",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-listing-agent",
    objective: "Draft listing-agent pre-sale moisture inspection offer",
    taskType: "copy_drafting",
    status: "queued",
    priority: "medium",
    driver: "Arc",
    risk: "Low",
    approvalRequired: true,
    campaign: "Listing Agent Pre-Sale",
    persona: "Listing Agent",
    campaignStatus: "Drafting",
    progress: { done: 0, total: 4 },
    dueOffset: 3 * DAY,
    updatedOffset: -7 * HOUR,
    output: {
      title: "Listing agent pre-sale — moisture inspection offer",
      outputType: "offer_copy",
      formatLabel: "Copy · offer + email · queued",
      body: "A co-marketing offer for listing agents: a pre-sale moisture inspection that de-risks deals and protects their commission. Includes an agent email and a client-facing one-liner.",
      previewHeadline: "Close clean — no moisture surprises.",
      previewSub: "A fast pre-sale inspection protects your deal and your client.",
      previewCta: "Book a pre-sale check",
      approvalStatus: "queued",
      complianceStatus: "pending",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-blocked-media",
    objective: "Awaiting approved before/after media for Mold campaign",
    taskType: "media_sourcing",
    status: "blocked",
    priority: "medium",
    driver: "Evan",
    risk: "Medium",
    approvalRequired: true,
    campaign: "Mold Remediation Awareness",
    persona: "Landlord",
    campaignStatus: "In review",
    progress: { done: 1, total: 3 },
    updatedOffset: -4 * HOUR,
    output: {
      title: "Mold before/after media — sourcing blocked",
      outputType: "media_request",
      formatLabel: "Media request · 1 blocking gap",
      body: "The mold creative needs cleared before/after frames, but the available set lacks owner sign-off and redaction review. Blocked until approved, privacy-checked media is attached — Arc will not substitute stock or AI imagery for proof.",
      previewHeadline: "Awaiting approved proof media.",
      previewSub: "Real BSR before/after frames, owner-approved and redaction-checked.",
      previewCta: "Attach approved media",
      approvalStatus: "blocked",
      complianceStatus: "blocked",
      riskFlags: ["No owner-approved before/after set available yet", "Privacy/redaction review required before use"],
    },
  },
  {
    id: "demo-task-done-storm-brief",
    objective: "Complete Spring Storm Prep campaign brief + audience plan",
    taskType: "campaign_brief",
    status: "completed",
    priority: "high",
    driver: "Arc",
    risk: "Low",
    approvalRequired: false,
    campaign: "Spring Storm Prep 2026",
    persona: "Homeowner / Preventative",
    campaignStatus: "Live",
    progress: { done: 5, total: 5 },
    updatedOffset: -1 * DAY,
    output: {
      title: "Spring Storm Prep — campaign brief + audience plan",
      outputType: "campaign_brief",
      formatLabel: "Brief · approved · audience plan attached",
      body: "The approved brief sets the preventative angle, the proactive-homeowner audience, a lookalike expansion, persona logic, and the success metrics. It unlocked the creative-generation work now in flight.",
      previewHeadline: "Get ahead of storm season.",
      previewSub: "Proactive homeowners, preventative inspections, booked before the rush.",
      previewCta: "View the plan",
      approvalStatus: "approved",
      complianceStatus: "passed",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-done-emergency-launch",
    objective: "Emergency Water Response launch package approved & locked",
    taskType: "campaign_package",
    status: "completed",
    priority: "urgent",
    driver: "Evan",
    risk: "Low",
    approvalRequired: false,
    campaign: "Emergency Water Response 2026",
    persona: "Homeowner / Emergency",
    campaignStatus: "Live",
    progress: { done: 7, total: 7 },
    updatedOffset: -1 * DAY - 4 * HOUR,
    output: {
      title: "Emergency Water Response — launch package",
      outputType: "campaign_package",
      formatLabel: "Package · approved · 7 deliverables",
      body: "The full launch package — paid social, landing one-pager, intake email, and SMS — was approved and locked. Each deliverable cleared the guardrail pass and carries an owner approval on record.",
      previewHeadline: "Emergency Water Response. Fast.",
      previewSub: "24/7 dispatch, documented mitigation, approved and ready.",
      previewCta: "Open the package",
      approvalStatus: "approved",
      complianceStatus: "passed",
      riskFlags: [],
    },
  },
  {
    id: "demo-task-done-gc-partner",
    objective: "GC / remodeler partner referral sheet approved",
    taskType: "partner_asset",
    status: "completed",
    priority: "medium",
    driver: "Arc",
    risk: "Low",
    approvalRequired: false,
    campaign: "GC Remodeler Partnerships",
    persona: "GC / Remodeler Partner",
    campaignStatus: "Live",
    progress: { done: 3, total: 3 },
    updatedOffset: -2 * DAY,
    output: {
      title: "GC / remodeler partner — referral sheet",
      outputType: "partner_asset",
      formatLabel: "Partner sheet (PDF) · approved",
      body: "A co-branded referral sheet for GCs and remodelers covering water/fire/mold scope handoff, response-time expectations, and a reciprocal-referral note. Approved and available for partner outreach.",
      previewHeadline: "Restoration scope, handled.",
      previewSub: "Refer the mitigation; keep your remodel timeline on track.",
      previewCta: "Partner with BSR",
      approvalStatus: "approved",
      complianceStatus: "passed",
      riskFlags: [],
    },
  },
];

const PARTNER_PERSONAS = /partner|agent|board|manager|landlord|gc|remodeler/i;

function expandGenericSeed(seed: GenericSeed): DemoTaskSeed {
  const isArc = seed.driver === "Arc";
  const driverFirst = isArc ? "Arc" : "Evan";
  const isDone = seed.status === "completed";
  const isBlocked = seed.status === "blocked";
  const isRunning = seed.status === "running";

  const criteria: DemoTaskCriterion[] = [
    { id: "c1", label: `Grounded in the ${seed.campaign} brief and source records`, done: true },
    { id: "c2", label: "Built from approved BSR proof where media is used", done: !isBlocked },
    { id: "c3", label: "Guardrail pass on claim and privacy language", done: isDone },
    {
      id: "c4",
      label: seed.approvalRequired ? "Owner approval before anything goes outbound" : "No outbound step — internal artifact only",
      done: isDone,
    },
  ];

  const inputs: DemoTaskInput[] = [
    { id: "i1", label: `Brief — ${seed.campaign}`, kind: "Brief", detail: `Angle and audience for the ${seed.persona.toLowerCase()} segment.`, href: "/campaigns" },
    {
      id: "i2",
      label: PARTNER_PERSONAS.test(seed.persona) ? "Partner / company record" : "Lead — source record",
      kind: "Source record",
      detail: `Primary ${seed.persona.toLowerCase()} record this work is built for.`,
      href: PARTNER_PERSONAS.test(seed.persona) ? "/crm/companies/demo-cwm-company" : "/crm/leads/demo-ewr-lead-1",
    },
    { id: "i3", label: "Approved media — proof set", kind: "Approved media", detail: "Cleared before/after frames available for this campaign.", href: null },
  ];

  const steps: DemoTaskStep[] = [
    {
      id: "s1",
      actor: isArc ? "System" : "Human",
      title: isArc ? "Task queued from the campaign plan" : `${driverFirst} requested this work`,
      body: `Opened to support ${seed.campaign} for the ${seed.persona.toLowerCase()} segment.`,
      at: iso(seed.updatedOffset - 6 * HOUR),
    },
    {
      id: "s2",
      actor: "Arc",
      title: "Gathered inputs and source records",
      body: "Pulled the brief, the matching CRM record, and any approved proof media before drafting.",
      at: iso(seed.updatedOffset - 3 * HOUR),
    },
    {
      id: "s3",
      actor: "Arc",
      title: isDone ? "Produced the deliverable and ran the guardrail pass" : isRunning ? "Drafting the deliverable" : "Prepared to draft the deliverable",
      body: isBlocked
        ? "Hit a blocking gap — see the flagged output below before this can continue."
        : "Assembled the output and checked claim and privacy language.",
      at: iso(seed.updatedOffset - 30 * 60_000),
    },
    {
      id: "s4",
      actor: isDone ? "Approval" : isBlocked ? "System" : "Approval",
      title: isDone
        ? "Approved and locked"
        : isBlocked
          ? "Held — blocked on a dependency"
          : seed.approvalRequired
            ? "Routed for owner review"
            : "Ready as an internal artifact",
      body: isDone
        ? "Owner approval is on record; the deliverable is locked."
        : isBlocked
          ? "Stays blocked until the dependency is resolved. Outbound locked."
          : seed.approvalRequired
            ? "Outbound locked. Awaiting the owner's decision."
            : "No outbound step. Available for the next stage of work.",
      at: iso(seed.updatedOffset),
      active: !isDone,
    },
  ];

  const approvers: DemoTaskApprover[] = isDone
    ? [
        { name: "Evan", role: "Owner", state: "Approved" },
        { name: "Arc", role: "Preparer", state: "Approved" },
      ]
    : seed.approvalRequired
      ? [
          { name: "Evan", role: "Owner", state: isBlocked ? "Required" : "Waiting" },
          { name: "Arc", role: "Preparer", state: isBlocked ? "Waiting" : "Approved" },
        ]
      : [{ name: "Arc", role: "Owner of internal artifact", state: "Approved" }];

  const linkedRecords = [{ label: "Campaign", detail: seed.campaign, href: "/campaigns" }];
  if (seed.approvalRequired) {
    linkedRecords.push({ label: "Approval item", detail: humanizeType(seed.output.outputType), href: `/approvals?item=${seed.id}` });
  }

  return {
    id: seed.id,
    objective: seed.objective,
    brief: `${seed.output.body} ${
      isBlocked ? "This ticket is blocked until the gap is resolved." : seed.approvalRequired ? "Nothing reaches the outside world until the owner approves." : "Internal artifact — no outbound step."
    }`,
    taskType: seed.taskType,
    status: seed.status,
    priority: seed.priority,
    driverLabel: driverFirst,
    ownerLabel: "Evan",
    approverLabel: "Evan",
    campaign: { name: seed.campaign, persona: seed.persona, status: seed.campaignStatus },
    dueAt: seed.dueOffset != null ? iso(seed.dueOffset) : null,
    scheduledFor: seed.scheduledOffset != null ? iso(seed.scheduledOffset) : null,
    createdAt: iso(seed.updatedOffset - 8 * HOUR),
    updatedAt: iso(seed.updatedOffset),
    progress: seed.progress,
    criteria,
    inputs,
    output: {
      title: seed.output.title,
      outputType: seed.output.outputType,
      formatLabel: seed.output.formatLabel,
      body: seed.output.body,
      previewHeadline: seed.output.previewHeadline,
      previewSub: seed.output.previewSub,
      previewCta: seed.output.previewCta,
      riskLevel: seed.risk,
      complianceStatus: seed.output.complianceStatus,
      approvalStatus: seed.output.approvalStatus,
      riskFlags: seed.output.riskFlags,
    },
    steps,
    approvers,
    approvalRequired: seed.approvalRequired,
    linkedRecords,
  };
}

function humanizeType(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) : id;
}

export function getDemoTaskDetail(taskId: string): DemoTaskDetail | null {
  const authored = SEEDS.find((s) => s.id === taskId);
  if (authored) return { ...authored, isDemo: true, shortId: shortId(authored.id) };

  const generic = GENERIC_SEEDS.find((s) => s.id === taskId);
  if (generic) {
    const expanded = expandGenericSeed(generic);
    return { ...expanded, isDemo: true, shortId: shortId(expanded.id) };
  }

  return null;
}

export function isDemoTaskId(taskId: string): boolean {
  return SEEDS.some((s) => s.id === taskId) || GENERIC_SEEDS.some((s) => s.id === taskId);
}
