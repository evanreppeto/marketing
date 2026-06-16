import type { ArcActionCard } from "@/domain";
import type { ArcConversation, ArcMessage, ArcProject } from "@/lib/arc-chat/persistence";
import type { MentionGroup } from "@/lib/arc-chat/mention-search";

/**
 * Preview-mode sample data so the full Arc chat UI renders without Supabase or
 * any applied migrations. Used by `page.tsx` whenever the real conversation tables
 * can't be loaded. Timestamps are computed relative to render time so the sidebar's
 * date buckets and relative timestamps look natural.
 */

const CONV = "demo-conv-1";

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// A PROJECT is an initiative folder that groups chats (and spans campaigns). A
// CAMPAIGN (below, "Storm Response 2026") is the deliverable the chat produces.
// Deliberately different names so the two roles read clearly in the sidebar.
const PROJECT: ArcProject = {
  id: "demo-project-1",
  operator: "demo",
  name: "Q3 Storm Season",
  createdAt: ago(9 * DAY),
  updatedAt: ago(2 * HOUR),
};

function conv(id: string, title: string, agoMs: number, extra?: Partial<ArcConversation>): ArcConversation {
  return {
    id,
    operator: "demo",
    title,
    status: "active",
    pinnedAt: null,
    projectId: null,
    campaignId: null,
    createdAt: ago(agoMs + HOUR),
    updatedAt: ago(agoMs),
    lastMessageAt: ago(agoMs),
    ...extra,
  };
}

const CONVERSATIONS: ArcConversation[] = [
  conv(CONV, "Storm-response campaign for landlords", 7 * MIN, { projectId: PROJECT.id, campaignId: "demo-campaign" }),
  conv("demo-conv-2", "Find new leads in flood zones", 40 * MIN),
  conv("demo-conv-3", "Summarize last week's approvals", 3 * HOUR),
  conv("demo-conv-4", "Draft a referral packet", 26 * HOUR),
  conv("demo-conv-5", "HOA board outreach ideas", 5 * DAY),
];

// The campaign package Arc drafted — six assets across channels, mixed provenance.
// Each card stands alone (own media + channel + status) so it renders in the chat
// deck and the Studio asset library. Outbound stays locked; all need approval.
const CAMPAIGN_ASSETS: ArcActionCard[] = [
  {
    kind: "draft",
    title: "Lead Ad — \"Water doesn't wait\"",
    channel: "Meta / Instagram",
    format: "1:1",
    status: "draft",
    rows: [
      { name: "Channel", meta: "Meta / Instagram" },
      { name: "Persona", meta: "Landlord" },
      { name: "Restoration focus", meta: "Flood" },
    ],
    preview: "When the water rises, we're already on the way. Priority restoration for flood-zone properties — insurance-direct.",
    flags: [
      { tone: "ok", label: "On-brand" },
      { tone: "warn", label: "Needs your approval" },
    ],
    media: {
      kind: "image",
      url: "https://picsum.photos/seed/bsr-storm-a/1080/1080",
      caption: "Reused approved BSR crew photo",
      alt: "BSR crew responding to flood damage",
      source: "bsr_real",
      sourceId: "media_4821",
      format: "1:1",
      status: "approved",
    },
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-1" },
  },
  {
    kind: "draft",
    title: "Ad Variant B — urgency cut",
    channel: "Meta / Instagram",
    format: "4:5",
    status: "draft",
    rows: [
      { name: "Channel", meta: "Meta / Instagram" },
      { name: "Persona", meta: "Landlord" },
      { name: "Variant", meta: "B · urgency" },
    ],
    preview: "Storm season is here. Lock your priority restoration slot before the next flood warning.",
    flags: [
      { tone: "ok", label: "On-brand" },
      { tone: "risk", label: "Check embedded text" },
    ],
    media: {
      kind: "image",
      url: "https://picsum.photos/seed/bsr-storm-b/1080/1350",
      caption: "AI-generated variant",
      alt: "Flooded street with storm clouds",
      source: "ai_generated",
      model: "imagen-fast",
      jobId: "job_7731",
      format: "4:5",
      status: "draft",
      riskFlags: ["embedded text"],
    },
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-2" },
  },
  {
    kind: "draft",
    title: "Reel cover — 9:16",
    channel: "Instagram Reels",
    format: "9:16",
    status: "draft",
    rows: [
      { name: "Channel", meta: "Instagram Reels" },
      { name: "Persona", meta: "Landlord" },
      { name: "Length", meta: "15s" },
    ],
    preview: "90 minutes on-site. Insurance-direct. The team flood-zone landlords keep on speed dial.",
    flags: [{ tone: "warn", label: "Needs your approval" }],
    media: {
      kind: "image",
      url: "https://picsum.photos/seed/bsr-storm-reel/1080/1920",
      caption: "Composite cover frame",
      alt: "Vertical storm response reel cover",
      source: "composite",
      jobId: "job_7732",
      format: "9:16",
      status: "draft",
    },
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-3" },
  },
  {
    kind: "draft",
    title: "Email — priority slot offer",
    channel: "Email",
    format: "email",
    status: "draft",
    rows: [
      { name: "Channel", meta: "Email" },
      { name: "Subject", meta: "Before the next flood warning" },
      { name: "Persona", meta: "Landlord" },
    ],
    preview: "Reserve your priority restoration slot before the next flood warning — 90-minute on-site response, insurance-direct billing, and a team flood-zone landlords keep on speed dial.",
    flags: [{ tone: "warn", label: "Needs your approval" }],
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-4" },
  },
  {
    kind: "draft",
    title: "SMS — storm-warning nudge",
    channel: "SMS",
    format: "sms",
    status: "draft",
    rows: [
      { name: "Channel", meta: "SMS" },
      { name: "Persona", meta: "Landlord" },
      { name: "Trigger", meta: "Flood watch issued" },
    ],
    preview: "Big Shoulders: flood watch in your area. Reply SLOT to lock 90-min priority restoration for your properties. Insurance-direct.",
    flags: [
      { tone: "warn", label: "Needs your approval" },
      { tone: "risk", label: "Compliance: opt-in required" },
    ],
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-5" },
  },
  {
    kind: "draft",
    title: "Leave-behind one-pager",
    channel: "Print / PDF",
    format: "pdf",
    status: "draft",
    rows: [
      { name: "Format", meta: "Letter · PDF" },
      { name: "Use", meta: "Door-knock / partner handoff" },
      { name: "Persona", meta: "Landlord" },
    ],
    preview: "Flood-ready landlord one-pager: response guarantee, insurance-direct billing, and a QR to reserve a priority slot.",
    flags: [{ tone: "warn", label: "Needs your approval" }],
    media: {
      kind: "image",
      url: "https://picsum.photos/seed/bsr-storm-onepager/1240/1754",
      caption: "One-pager layout",
      alt: "Flood-ready landlord one-pager",
      source: "composite",
      jobId: "job_7740",
      format: "pdf",
      status: "draft",
    },
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-6" },
  },
];

const MESSAGES: ArcMessage[] = [
  {
    id: "demo-op-1",
    conversationId: CONV,
    role: "operator",
    body: "Draft a storm-response campaign for landlords in flood zones.",
    status: "sent",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: ago(9 * MIN),
  },
  {
    id: "demo-arc-1",
    conversationId: CONV,
    role: "arc",
    body:
      "Here's a full **Storm Response** campaign package aimed at flood-zone landlords — six assets across paid social, email, SMS, and a leave-behind.\n\n" +
      "**Angle:** lead with speed and certainty — when water rises, you're already on the list.\n\n" +
      "- Hook: \"Water doesn't wait. Neither do we.\"\n" +
      "- Proof: 90-minute on-site response, insurance-direct billing\n" +
      "- CTA: reserve a priority slot before storm season\n\n" +
      "Everything's in the Studio for review. Outbound stays locked — nothing sends until you approve.",
    status: "complete",
    agentTaskId: null,
    mentions: [
      { type: "lead", id: "demo-lead-1", label: "Rivertown Property Mgmt — flood watch", href: "/crm/leads/demo-lead-1" },
      { type: "lead", id: "demo-lead-2", label: "Eastside Rentals LLC", href: "/crm/leads/demo-lead-2" },
      { type: "company", id: "demo-co-1", label: "Harbor Point Holdings", href: "/crm/companies/demo-co-1" },
      { type: "contact", id: "demo-ct-1", label: "Dana Ruiz — Ops Manager, Rivertown", href: "/crm/contacts/demo-ct-1" },
    ],
    media: [],
    steps: [
      {
        label: "Pulled the flood-zone landlord persona",
        status: "done",
        at: ago(8 * MIN),
        detail: [
          "Matched persona: Landlord (flood-zone) — confidence 0.86",
          "Pain points: speed of response, insurance paperwork, tenant turnover",
        ],
      },
      {
        label: "Reviewed three recent storm leads",
        status: "done",
        at: ago(8 * MIN),
        detail: [
          "2 inbound from the last flood watch, 1 reactivated dormant company",
          "All inside the 90-minute service radius",
        ],
      },
      {
        label: "Reused 2 approved BSR storm photos + generated 3 variants",
        status: "done",
        at: ago(7 * MIN),
        detail: [
          "Preferred real approved media (#media_4821) over stock",
          "Generated 3 AI variants for A/B — flagged one for embedded text",
        ],
      },
      { label: "Drafted ad / email / SMS copy + a leave-behind one-pager", status: "done", at: ago(7 * MIN) },
    ],
    reasoning:
      "Flood-zone landlords decide on speed and certainty, not price, so I led the package with response-time proof rather than discounts. " +
      "I preferred approved BSR media over stock to keep claims defensible, and kept all outbound locked behind approval since this segment is relationship-driven and a misfire is costly.",
    toolCalls: [
      {
        name: "find_leads",
        status: "complete",
        input: '{ "persona": "landlord_flood_zone", "radius_min": 90, "signal": "active_flood_watch" }',
        output: "3 matches — 2 inbound (last flood watch), 1 reactivated dormant company. All within the 90-minute service radius.",
      },
      {
        name: "score_lead",
        status: "complete",
        input: '{ "lead_id": "demo-lead-1", "model": "persona_revenue_v2" }',
        output: '{ "persona": "landlord_flood_zone", "confidence": 0.86, "revenue_opportunity": "high", "next_best_action": "priority_slot_offer" }',
      },
      {
        name: "weather_signal",
        status: "complete",
        input: '{ "region": "harbor_point", "horizon_days": 7 }',
        output: "Coastal flood watch issued for the next 48h — elevated urgency for the target ZIP cluster.",
      },
    ],
    feedback: null,
    actions: CAMPAIGN_ASSETS,
    suggestions: ["Make 3 more ad variants", "Find landlords in recent flood-zone leads", "Tighten the email subject line"],
    attachments: [],
    createdAt: ago(7 * MIN),
  },
];

const MENTION_GROUPS: MentionGroup[] = [];

export type DemoChatProps = {
  conversations: ArcConversation[];
  projects: ArcProject[];
  archived: ArcConversation[];
  showArchived: boolean;
  activeId: string;
  activeTitle: string;
  activeProjectId: string | null;
  activeCampaignId: string | null;
  campaigns: { id: string; name: string }[];
  activePinned: boolean;
  initialMessages: ArcMessage[];
  mentionGroups: MentionGroup[];
  operatorName: string | null;
  pendingApprovals: number;
};

/** Full ArcChat prop bag for preview mode. */
export function getDemoChat(): DemoChatProps {
  return {
    conversations: CONVERSATIONS,
    projects: [PROJECT],
    archived: [],
    showArchived: false,
    activeId: CONV,
    activeTitle: CONVERSATIONS[0].title,
    activeProjectId: PROJECT.id,
    activeCampaignId: "demo-campaign",
    campaigns: [{ id: "demo-campaign", name: "Storm Response 2026" }],
    activePinned: false,
    initialMessages: MESSAGES,
    mentionGroups: MENTION_GROUPS,
    operatorName: "Evan",
    pendingApprovals: 2,
  };
}

/** A canned Arc reply for preview-mode sends (no backend). */
export function demoReply(toBody: string): ArcMessage {
  return {
    id: `demo-reply-${toBody.length}-${toBody.slice(0, 8)}`,
    conversationId: CONV,
    role: "arc",
    body:
      "This is **preview mode**, so I'm showing sample behavior rather than really working.\n\n" +
      "Connect Supabase (and apply the latest migration) to chat with me for real — then sends, drafts, saves, and promote-to-campaign all persist.",
    status: "complete",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: ["Show me the saved view", "Attach a campaign to this chat"],
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}
