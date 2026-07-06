import { getAgentOperationsDashboard, type AgentOperationsTask } from "@/lib/agent-operations/read-model";
import { listApprovalCards, type ApprovalCard } from "@/lib/approvals/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import {
  OutboxBoard,
  type BoardCardVM,
  type KpiVM,
  type LaneVM,
  type OutboxCardVM,
  type OutboxChannel,
} from "./_components/outbox-board";

export const metadata = { title: "Outbox — Arc" };

function normChannel(channel: string): OutboxChannel {
  const c = (channel || "").toLowerCase();
  if (/sms|text/.test(c)) return "sms";
  if (/social|meta|instagram|facebook|linkedin|paid|ad\b/.test(c)) return "social";
  if (/email|mail/.test(c)) return "email";
  return "other";
}

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  if (!s || /^unassigned/i.test(s)) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type OutboxLaneKey = "awaiting" | "queued" | "held";

function statusLane(status: string): OutboxLaneKey {
  const s = (status || "").toLowerCase();
  if (/^approved/.test(s)) return "queued";
  if (/revision|declin|reject|block|revert|hold|fail/.test(s)) return "held";
  return "awaiting";
}

const OUTBOX_LANE_META: { key: OutboxLaneKey; label: string; color: string }[] = [
  { key: "awaiting", label: "Awaiting approval", color: "#c8a24a" },
  { key: "queued", label: "Queued to send", color: "#88b6d8" },
  { key: "held", label: "Held", color: "#cc6a6a" },
];

function toOutboxCard(card: ApprovalCard): OutboxCardVM & { lane: OutboxLaneKey } {
  const lane = statusLane(card.status);
  const channel = normChannel(card.channel);
  const persona = humanizePersona(card.persona);
  const campaign = [card.campaign?.name, persona].filter(Boolean).join(" · ") || "Campaign package";

  let note: string | null = null;
  let noteTone: OutboxCardVM["noteTone"] = "";
  if (lane === "held") {
    note = `${card.statusLabel} — sent back before it can queue.`;
    noteTone = /declin|reject/.test(card.status.toLowerCase()) ? "red" : "warn";
  } else if (channel === "sms" || channel === "social") {
    note = `${channel === "sms" ? "SMS" : "Social"} transport isn't wired yet — stays in the Outbox.`;
    noteTone = "warn";
  }

  return {
    id: card.id,
    channel,
    title: card.title,
    campaign,
    note,
    noteTone,
    href: "/campaigns",
    lane,
  };
}

const BOARD_LANE_META: { key: string; label: string; color: string; match: (s: string) => boolean }[] = [
  { key: "queued", label: "Queued", color: "#83838c", match: (s) => s === "queued" },
  { key: "running", label: "Running", color: "#c8a24a", match: (s) => s === "running" || s === "in_progress" },
  { key: "needs_approval", label: "Needs approval", color: "#88b6d8", match: (s) => /approval/.test(s) },
  { key: "blocked", label: "Blocked", color: "#cc6a6a", match: (s) => s === "blocked" || s === "failed" },
  { key: "completed", label: "Done", color: "#7fb89a", match: (s) => s === "completed" || s === "done" },
];

function toBoardCard(task: AgentOperationsTask): BoardCardVM {
  const kind = task.owner?.kind === "agent" ? "agent" : task.owner?.kind === "human" ? "human" : "system";
  const ownerLabel = kind === "agent" ? "Arc" : kind === "human" ? "You" : "System";
  const relation = task.campaignLabel || task.linkedObject || task.personaLabel || "";
  return {
    id: task.id,
    ownerKind: kind,
    ownerLabel,
    title: task.task,
    relation,
    href: task.approvalHref || task.href || null,
  };
}

export default async function OutboxPage() {
  const ctx = await getCurrentWorkspaceContext();
  const [cards, dashboard] = await Promise.all([
    listApprovalCards({ orgId: ctx.orgId }).catch(() => [] as ApprovalCard[]),
    getAgentOperationsDashboard(undefined, "Arc").catch(() => ({ status: "unavailable" }) as const),
  ]);

  const outboxCards = cards.map(toOutboxCard);
  const outboxLanes: LaneVM<OutboxCardVM>[] = OUTBOX_LANE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    cards: outboxCards.filter((c) => c.lane === meta.key),
  }));

  const channelCounts = outboxCards.reduce<Record<string, number>>((acc, c) => {
    acc[c.channel] = (acc[c.channel] ?? 0) + 1;
    return acc;
  }, {});

  const tasks = dashboard.status === "live" ? dashboard.tasks : [];
  const boardCards = tasks.map(toBoardCard);
  const boardLanes: LaneVM<BoardCardVM>[] = BOARD_LANE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    cards: tasks.filter((t) => meta.match((t.status || "").toLowerCase())).map(toBoardCard),
  }));

  const awaiting = outboxLanes[0].cards.length;
  const queued = outboxLanes[1].cards.length;
  const held = outboxLanes[2].cards.length;
  const arcActive = tasks.filter((t) => ["queued", "running", "in_progress"].includes((t.status || "").toLowerCase())).length;

  const kpis: KpiVM[] = [
    { value: `${awaiting}`, label: "Awaiting your approval", sub: "in the approval queue", alert: awaiting > 0 },
    { value: `${queued}`, label: "Queued to send", sub: "locked until you confirm", alert: false },
    { value: `${held}`, label: "Held", sub: held > 0 ? "needs attention" : "all clear", alert: false },
    { value: `${arcActive}`, label: "Arc tasks active", sub: `${boardCards.length} on the board`, alert: false },
  ];

  return <OutboxBoard outboxLanes={outboxLanes} boardLanes={boardLanes} kpis={kpis} channelCounts={channelCounts} />;
}
