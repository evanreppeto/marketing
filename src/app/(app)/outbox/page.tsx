import { getAgentOperationsDashboard, type AgentOperationsTask } from "@/lib/agent-operations/read-model";
import { buildOutboxKpis } from "@/lib/dispatch/kpis";
import { getOutboxList } from "@/lib/dispatch/read-model";
import { type DispatchStatus, type DispatchView } from "@/lib/dispatch/status";

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

// The dispatch lifecycle the mockup shows (canceled is dropped unless present).
const LANE_META: { key: DispatchStatus; label: string; color: string }[] = [
  { key: "queued", label: "Queued", color: "#c8a24a" },
  { key: "scheduled", label: "Scheduled", color: "#88b6d8" },
  { key: "sent", label: "Sent", color: "#9678c8" },
  { key: "delivered", label: "Delivered", color: "#7fb89a" },
  { key: "failed", label: "Failed", color: "#cc6a6a" },
];

const ACTION: Partial<Record<DispatchStatus, string>> = {
  queued: "Confirm send",
  scheduled: "Send now",
  sent: "Mark delivered",
  failed: "Retry",
};

// Where each operator action moves the dispatch. `queued`/`scheduled` are real
// sends (the operator confirms; executeResendDispatch delivers and flips the row
// to `sent`); the rest are after-the-fact lifecycle marks. `actionTo` is the
// target state either way.
const ACTION_TARGET: Partial<Record<DispatchStatus, DispatchStatus>> = {
  queued: "sent",
  scheduled: "sent",
  sent: "delivered",
  failed: "queued",
};

// Statuses whose operator action performs a real outbound send (a human confirm),
// not just a lifecycle status stamp.
const SEND_ACTIONS: ReadonlySet<DispatchStatus> = new Set<DispatchStatus>(["queued", "scheduled"]);

function noteTone(status: DispatchStatus): OutboxCardVM["noteTone"] {
  if (status === "failed") return "red";
  if (status === "sent" || status === "scheduled") return "warn";
  return "";
}

function toOutboxCard(d: DispatchView): OutboxCardVM & { status: DispatchStatus } {
  const recipients = typeof d.audienceCount === "number" ? d.audienceCount.toLocaleString() : null;
  const when = d.dispatchedAt || d.scheduledFor;
  const meta = [recipients ? `${recipients} recipients` : null, when].filter(Boolean).join(" · ") || null;
  return {
    id: d.id,
    status: d.status,
    channel: normChannel(d.channel),
    title: d.recipientSummary || d.deliverable,
    campaign: d.campaignName,
    note: d.resultNote,
    noteTone: noteTone(d.status),
    href: d.campaignId ? `/campaigns/${d.campaignId}` : "/campaigns",
    meta,
    action: ACTION[d.status] ?? null,
    actionTo: ACTION_TARGET[d.status] ?? null,
    actionKind: SEND_ACTIONS.has(d.status) ? "send" : "transition",
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
  return { id: task.id, ownerKind: kind, ownerLabel, title: task.task, relation, href: task.approvalHref || task.href || null };
}

export default async function OutboxPage() {
  const [outbox, dashboard] = await Promise.all([
    getOutboxList().catch(() => ({ status: "unavailable" }) as const),
    getAgentOperationsDashboard(undefined, "Arc").catch(() => ({ status: "unavailable" }) as const),
  ]);

  const dispatches = outbox.status === "live" ? outbox.dispatches.map(toOutboxCard) : [];
  const outboxLanes: LaneVM<OutboxCardVM>[] = LANE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    cards: dispatches.filter((d) => d.status === meta.key),
  }));

  const channelCounts = dispatches.reduce<Record<string, number>>((acc, c) => {
    acc[c.channel] = (acc[c.channel] ?? 0) + 1;
    return acc;
  }, {});

  const tasks = dashboard.status === "live" ? dashboard.tasks : [];
  const boardLanes: LaneVM<BoardCardVM>[] = BOARD_LANE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    cards: tasks.filter((t) => meta.match((t.status || "").toLowerCase())).map(toBoardCard),
  }));

  // Tiles: value counts dispatches, reach goes in the sub. See lib/dispatch/kpis.
  const kpis: KpiVM[] = buildOutboxKpis(outbox.status === "live" ? outbox.dispatches : []);

  return <OutboxBoard outboxLanes={outboxLanes} boardLanes={boardLanes} kpis={kpis} channelCounts={channelCounts} />;
}
