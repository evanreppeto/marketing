import Link from "next/link";
import { connection } from "next/server";

import { EmptyState, PageHeader, Panel, StatStrip, StatusPill, type StatItem } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { cx, theme } from "../_components/theme";
import { BoardViewSwitch } from "../agent-operations/board-view-switch";
import {
  getAgentOperationsDashboard,
  type AgentOperationsApproval,
  type AgentOperationsMetric,
  type AgentOperationsTask,
} from "@/lib/agent-operations/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Board" };

export default async function BoardPage() {
  await connection();

  const agentName = await getAgentName();
  const dashboard = await getAgentOperationsDashboard(undefined, agentName);

  if (dashboard.status === "unavailable") {
    return (
      <>
        <Header agentName={agentName} />
        <EmptyState title="Task board unavailable" detail={dashboard.message} />
      </>
    );
  }

  const stats = buildBoardStats(dashboard.metrics);
  const health = buildBoardHealth(dashboard.tasks);

  return (
    <>
      <Header agentName={agentName} />

      <StatStrip items={stats} columns={6} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <WorkspacePanel
          className="p-0"
          eyebrow="Task queue"
          title={`Shared work for you and ${agentName}`}
          description={`Move work across the board. ${agentName} can prepare drafts; humans approve anything outbound.`}
          aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
        >
          <BoardViewSwitch tasks={dashboard.tasks} />
        </WorkspacePanel>

        <BoardRail
          agentName={agentName}
          health={health}
          approvals={dashboard.approvals}
          featured={pickFeatured(dashboard.tasks)}
        />
      </div>
    </>
  );
}

function Header({ agentName }: { agentName: string }) {
  return (
    <PageHeader
      title="Task Board"
      description={`A simple shared queue: what ${agentName} is doing, what humans need to review, and what is done.`}
      aside={<StatusPill tone="amber">Approval gated</StatusPill>}
    />
  );
}

const STATUS_COLORS: Record<string, string> = {
  needs_approval: "var(--warn)",
  running: "var(--accent)",
  queued: "var(--text-muted)",
  blocked: "var(--priority)",
  completed: "var(--ok)",
};

function BoardRail({
  agentName,
  health,
  approvals,
  featured,
}: {
  agentName: string;
  health: BoardHealth;
  approvals: AgentOperationsApproval[];
  featured: AgentOperationsTask | null;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <Panel className="p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
          <div className={theme.text.eyebrow}>Board health</div>
          <StatusPill tone={health.blocked > 0 ? "amber" : "green"}>
            {health.blocked > 0 ? "Watch" : "On track"}
          </StatusPill>
        </div>

        <div className="flex items-center gap-4 px-4 py-3.5">
          <Ring pct={health.acceptancePct} />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Acceptance rate
            </div>
            <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--text-secondary)]">
              <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">{health.done}</span> approved of{" "}
              <span className="font-mono tabular-nums">{health.reviewed}</span> reviewed
            </p>
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--border-hairline)] px-4 py-3.5">
          <div className="text-[10.5px] font-medium text-[var(--text-muted)]">
            Status breakdown
          </div>
          <StatusBar label="Needs you" value={health.needsYou} total={health.total} color={STATUS_COLORS.needs_approval} />
          <StatusBar label={`${agentName} working`} value={health.working} total={health.total} color={STATUS_COLORS.running} />
          <StatusBar label="Waiting" value={health.queued} total={health.total} color={STATUS_COLORS.queued} />
          <StatusBar label="Blocked" value={health.blocked} total={health.total} color={STATUS_COLORS.blocked} />
          <StatusBar label="Done" value={health.done} total={health.total} color={STATUS_COLORS.completed} />
        </div>
      </Panel>

      <Panel className="p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
          <div className={theme.text.eyebrow}>Waiting on approval</div>
          <StatusPill tone={approvals.length > 0 ? "amber" : "green"}>{approvals.length}</StatusPill>
        </div>
        {approvals.length > 0 ? (
          <ul className="divide-y divide-[var(--border-hairline)]">
            {approvals.slice(0, 4).map((approval) => (
              <li key={approval.id}>
                <Link
                  href={approval.href}
                  className="block px-4 py-2.5 transition-[background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-inset)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                      {approval.campaign}
                    </span>
                    <StatusPill tone={riskTone(approval.risk)}>{approval.risk}</StatusPill>
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">
                    {approval.source} / {approval.status}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[12px] text-[var(--text-muted)]">Nothing is waiting on you.</p>
        )}
      </Panel>

      {featured ? (
        <Panel className="p-0">
          <div className="border-b border-[var(--border-hairline)] px-4 py-3">
            <div className={theme.text.eyebrow}>Featured item</div>
          </div>
          <div className="p-3">
            <FeaturedThumb label={featured.campaignLabel ?? featured.objective} risk={featured.risk} />
            <p className="mt-2.5 line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
              {featured.objective}
            </p>
            <p className="mt-1 truncate text-[10.5px] text-[var(--text-muted)]">
              {featured.personaLabel ?? featured.linkedObject}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusPill tone="amber">Needs review</StatusPill>
              <StatusPill tone={riskTone(featured.risk)}>{featured.risk} risk</StatusPill>
              <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {featured.priority}
              </span>
            </div>
            <Link
              href={featured.href}
              className={cx(theme.button.base, theme.button.sizes.sm, theme.button.variants.ghost, "mt-3 w-full")}
            >
              Open task
            </Link>
          </div>
        </Panel>
      ) : null}
    </aside>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-inset)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[13px] font-bold tabular-nums text-[var(--text-primary)]">
        {pct}%
      </span>
    </div>
  );
}

function StatusBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[88px] shrink-0 truncate text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%`, background: color }} />
      </span>
      <span className="w-5 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

function FeaturedThumb({ label, risk }: { label: string; risk: string }) {
  const accent = riskTone(risk) === "red" ? "var(--priority)" : riskTone(risk) === "amber" ? "var(--warn)" : "var(--accent)";
  return (
    <div
      className="relative flex h-20 items-end overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)] p-2.5"
      style={{ backgroundImage: `radial-gradient(120% 80% at 15% 0%, color-mix(in oklab, ${accent} 22%, transparent), transparent 70%)` }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: "repeating-linear-gradient(115deg, transparent 0 11px, color-mix(in oklab, var(--text-primary) 4%, transparent) 11px 12px)" }}
      />
      <span className="relative inline-flex items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
        <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: accent }} />
        <span className="max-w-[180px] truncate">{label}</span>
      </span>
    </div>
  );
}

type BoardHealth = {
  needsYou: number;
  working: number;
  queued: number;
  blocked: number;
  scheduled: number;
  done: number;
  reviewed: number;
  total: number;
  flowPct: number;
  acceptancePct: number;
};

function buildBoardHealth(tasks: AgentOperationsTask[]): BoardHealth {
  const needsYou = tasks.filter((t) => t.status === "needs_approval").length;
  const working = tasks.filter((t) => t.status === "running").length;
  const queued = tasks.filter((t) => t.status === "queued").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const scheduled = tasks.filter((t) => t.scheduledFor != null).length;
  const done = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length || 1;
  const flowPct = Math.round(((total - blocked) / total) * 100);
  // Acceptance = approved/done vs everything that has reached a review outcome
  // (done + currently needing review + blocked-on-review). Keeps the ring honest.
  const reviewed = done + needsYou + blocked;
  const acceptancePct = reviewed > 0 ? Math.round((done / reviewed) * 100) : 100;

  return { needsYou, working, queued, blocked, scheduled, done, reviewed, total, flowPct, acceptancePct };
}

function buildBoardStats(metrics: AgentOperationsMetric[]): StatItem[] {
  const toneByLabel: Record<string, StatItem["tone"]> = {
    "Approve gated": "amber",
    Pending: "neutral",
    "In progress": "accent",
    Blocked: "red",
    Scheduled: "neutral",
    Done: "ok",
  };

  return metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    hint: metric.delta,
    tone: toneByLabel[metric.label] ?? "neutral",
  }));
}

function pickFeatured(tasks: AgentOperationsTask[]): AgentOperationsTask | null {
  return (
    tasks.find((t) => t.status === "needs_approval" && t.priority.toLowerCase().includes("urgent")) ??
    tasks.find((t) => t.status === "needs_approval") ??
    tasks.find((t) => t.status === "blocked") ??
    null
  );
}

function riskTone(risk: string): "green" | "amber" | "red" {
  const value = risk.toLowerCase();
  if (value.includes("high")) return "red";
  if (value.includes("medium")) return "amber";
  return "green";
}
