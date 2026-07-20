// The backend-less demo data layer for the Arc chat. When no Supabase backend is
// present (the offline preview / `ARC_DEMO_DATA`), the view renders from these
// fixtures instead of live records. Pure data + one pure builder — no JSX, no I/O
// — so the demo path stays fully separable from the live path in arc-view.tsx.
//
// This is illustrative sample content for a demo tenant, not a hardcoded customer.

import type { ArcActionCard, ArcMention, ArcRecall } from "@/domain";
import type { ArcAttachment, ArcStep, ArcToolCall } from "@/lib/arc-chat/persistence";
import type { ArcThreadGroupVM } from "@/lib/arc-chat/read-model";

import type { ArcWaiting, RunRow } from "./arc-view.types";

export const DEMO_THREADS: ArcThreadGroupVM[] = [
  {
    group: "Today",
    items: [
      { id: "storm", title: "Storm-damage homeowners", when: "9:38 AM", active: true, pinned: true, running: false },
      { id: "past", title: "Past-customer outreach", when: "8:12 AM", active: false, pinned: false, running: true },
    ],
  },
  {
    group: "Yesterday",
    items: [
      { id: "property", title: "Property-manager list", when: "4:46 PM", active: false, pinned: false, running: false },
      { id: "noaa", title: "NOAA hail report read", when: "2:10 PM", active: false, pinned: false, running: false },
    ],
  },
  {
    group: "Previous 7 days",
    items: [
      { id: "inspection", title: "Inspection page rewrite", when: "Jul 10", active: false, pinned: false, running: false },
      { id: "adjuster", title: "Adjuster follow-ups", when: "Jul 8", active: false, pinned: false, running: false },
    ],
  },
];

export const DEMO_STEPS: ArcStep[] = [
  { label: "Read the Naperville storm brief", status: "done", at: "9:38 AM", kind: "think" },
  { label: "Matched recent hail exposure to CRM properties", status: "done", at: "9:38 AM", kind: "match" },
  { label: "Ranked homeowners by inspection urgency", status: "done", at: "9:38 AM", kind: "search" },
  { label: "Prepared a review-safe campaign package", status: "done", at: "9:38 AM", kind: "draft" },
];

export const DEMO_TOOLS: ArcToolCall[] = [
  { name: "weather.lookup", status: "complete", output: "Naperville hail swath" },
  { name: "crm.search", status: "complete", output: "142 matched properties" },
  { name: "audience.score", status: "complete", output: "$1.4M estimated opportunity" },
];

export const DEMO_BREAKDOWN_MD = `Here's how the 142 homes break down, and the tracking I'd attach so we can attribute booked jobs back to this run:

| Segment | Homes | Est. value | Top signal |
| --- | --: | --: | --- |
| Insured · fresh damage | 64 | $612K | No inspection booked |
| Aging roof · out-of-pocket | 41 | $455K | Roof age 8y+ |
| Property manager · multi-unit | 37 | $333K | Prior claim activity |

Every link gets tagged so attribution is clean:

\`\`\`text
?utm_source=arc&utm_medium=email&utm_campaign=naperville_storm&segment={persona}
\`\`\`
`;

export const DEMO_DRAFT_CARD: ArcActionCard = {
  kind: "draft",
  title: "Inspection follow-up email",
  channel: "Email",
  format: "64-home segment",
  status: "draft",
  preview:
    "Hi {first_name}, the recent Naperville hailstorm hit your block harder than most. We're offering a free, no-pressure inspection this week — and if there's claimable damage, we can help coordinate the insurance process.",
  rows: [
    { name: "Audience", meta: "64 insured · fresh damage" },
    { name: "Subject", meta: "Your roof may have hidden hail damage" },
  ],
  flags: [
    { tone: "ok", label: "Brand voice" },
    { tone: "ok", label: "Claims-safe" },
  ],
  approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-email" },
};

export const DEMO_PACKAGE_CARDS: ArcActionCard[] = [
  DEMO_DRAFT_CARD,
  {
    kind: "draft",
    title: "Warm inspection check-in",
    channel: "SMS",
    format: "152 / 160 chars",
    status: "draft",
    preview: "Hi {first_name} — it’s the {brand} crew. We’re checking roofs near you after the Naperville hail, no charge and no pressure. Want us to stop by?",
    rows: [{ name: "Audience", meta: "142-home segment" }],
    flags: [{ tone: "ok", label: "Claims-safe" }],
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-sms" },
  },
  {
    kind: "draft",
    title: "Naperville storm awareness",
    channel: "Paid social",
    format: "1:1 · Meta",
    status: "draft",
    preview: "Naperville got hit hard. Hidden hail damage can become a much bigger repair if it sits — book a free roof inspection while our crews are nearby.",
    rows: [{ name: "Headline", meta: "See what the storm left behind" }, { name: "CTA", meta: "Book now" }],
    flags: [{ tone: "ok", label: "Brand voice" }, { tone: "warn", label: "Needs image" }],
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-social" },
  },
  {
    kind: "draft",
    title: "Storm inspection landing page",
    channel: "Landing page",
    format: "Mobile-ready",
    status: "draft",
    preview: "Free roof inspection for storm-hit homes. See whether your roof has claimable damage before the next storm rolls through.",
    rows: [{ name: "Destination", meta: "Campaign-matched" }],
    flags: [{ tone: "ok", label: "Claims-safe" }],
    approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-landing" },
  },
];

export const DEMO_ATTACHMENTS: ArcAttachment[] = [
  { url: "/brand/login-background-v2.png", name: "storm-job-reference.png", contentType: "image/png", objectPath: "demo-ref-1" },
];

export const DEMO_SOURCES: ArcMention[] = [
  { type: "property", id: "demo-prop", label: "142 storm-zone properties", href: "/crm/properties" },
  { type: "campaign", id: "demo-camp", label: "Storm Rapid Response", href: "/campaigns" },
  { type: "company", id: "demo-co", label: "Naperville homeowners", href: "/crm/companies" },
];

export const DEMO_RECALL: ArcRecall[] = [
  { label: "Inspection-first beats discount-led", confidence: 0.86, nodeId: "demo-node-inspection" },
  { label: "Insured segment books fastest", confidence: 0.72, nodeId: "demo-node-insured" },
];

/** Offline preview: mirrors the demo opportunity inbox so the launcher's "waiting
 *  on you" nudges render without a backend. */
export const DEMO_WAITING: ArcWaiting = {
  approvals: 3,
  opportunities: 6,
  items: [
    {
      id: "demo-opp-next-iteration-storm-prep",
      title: "Spring Storm Prep is converting — draft the next iteration",
      urgency: "high",
      prompt:
        "Draft the next iteration of the Spring Storm Prep campaign based on what worked: For the next iteration, lead with Email, reuse “Storm-watch SMS nudge”. Keep it approval-gated.",
    },
    {
      id: "demo-opp-storm-riverside",
      title: "Flash-flood warning — Riverside basements at risk",
      urgency: "high",
      prompt: "Help me act on this opportunity: “Flash-flood warning — Riverside basements at risk”. What should we draft? Keep it approval-gated.",
    },
    {
      id: "demo-opp-partner-northside",
      title: "Northside Plumbing Co. sent 3 referrals — no co-marketing in place",
      urgency: "medium",
      prompt: "Help me act on this opportunity: “Northside Plumbing Co. sent 3 referrals — no co-marketing in place”. What should we draft? Keep it approval-gated.",
    },
  ],
};

/** The staged live-work commentary + rows shown while a demo run is "thinking",
 *  chosen from the request so the offline preview reads like a real run. */
export function buildDemoLiveWork(request?: string | null): { commentary: string; rows: RunRow[] } {
  const normalized = request?.trim().toLowerCase() ?? "";

  if (/(email|sms|campaign|draft|write|create|landing)/.test(normalized)) {
    return {
      commentary: "I’m reading the approved Storm Rapid Response package and brand profile before I draft. I’ll keep the message inspection-first, use only approved claims, and prepare everything for review.",
      rows: [
        { id: "demo-campaign", label: "Read Storm Rapid Response campaign package", detail: "4 approved channel assets", status: "queued", kind: "draft" },
        { id: "demo-brand", label: "Loaded the workspace brand voice", detail: "Approved proof points and messaging rules", status: "queued", kind: "tool" },
        { id: "demo-audience", label: "Reading the 142-home approved audience", detail: "Naperville hailstorm segment", status: "queued", kind: "match" },
        { id: "demo-draft", label: "Drafting the inspection-first message", detail: "Preparing a review-ready draft", status: "queued", kind: "draft" },
      ],
    };
  }

  if (/(search|find|look up|research|which|who|audience|lead)/.test(normalized)) {
    return {
      commentary: "I’m checking the selected workspace sources against the request now. I’ll show each source as it is used and separate confirmed matches from anything that still needs review.",
      rows: [
        { id: "demo-crm", label: "Searching CRM property records", detail: "Naperville storm footprint", status: "queued", kind: "search" },
        { id: "demo-weather", label: "Reading the hail exposure model", detail: "Severity and address confidence", status: "queued", kind: "search" },
        { id: "demo-history", label: "Checking inspection and claim history", detail: "Approved workspace records", status: "queued", kind: "match" },
        { id: "demo-rank", label: "Ranking matching homeowners", detail: "Urgency and data confidence", status: "queued", kind: "match" },
      ],
    };
  }

  return {
    commentary: "I’m reading the active campaign, audience, and conversation context so I can answer from the current workspace instead of guessing. I’ll keep each source and action visible as I use it.",
    rows: [
      { id: "demo-context", label: "Reading active campaign context", detail: "Storm Rapid Response", status: "queued", kind: "think" },
      { id: "demo-sources", label: "Loading selected workspace sources", detail: "Brand, CRM, and campaigns", status: "queued", kind: "tool" },
      { id: "demo-answer", label: "Preparing a source-backed response", status: "queued", kind: "draft" },
    ],
  };
}
