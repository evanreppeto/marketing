import Link from "next/link";
import { connection } from "next/server";

import { EmptyState, PageHeader, Panel, StatStrip, StatusPill, type StatItem } from "../_components/page-header";
import { theme } from "../_components/theme";
import {
  getRecentActivity,
  type ActivityEntry,
  type ActivityQuery,
  type ActivitySummary,
  type ActivityTone,
} from "@/lib/activity/read-model";

import { ActivityTimeline } from "./_components/activity-timeline";

export const metadata = {
  title: "Activity",
};

type ActivityPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const rangeFilters = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
] as const;

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  await connection();

  const params = await searchParams;
  const selectedRange = normalizeRange(getString(params.range));
  const query = buildActivityQuery(selectedRange);
  const activity = await getRecentActivity(query);

  if (activity.status === "unavailable") {
    return (
      <>
        <ActivityHeader selectedRange={selectedRange} />
        <EmptyState
          title="Activity will appear once the workspace is connected"
          detail="The log uses workspace records, agent runs, approvals, campaigns, and CRM events."
        />
      </>
    );
  }

  return (
    <>
      <ActivityHeader selectedRange={selectedRange} />

      <StatStrip items={buildActivityStats(activity.summary, activity.entries.length)} columns={5} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ActivityTimeline entries={activity.entries} />
        <ActivityRail entries={activity.entries} summary={activity.summary} />
      </div>
    </>
  );
}

function ActivityHeader({ selectedRange }: { selectedRange: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <PageHeader
        eyebrow="Workspace log"
        title="Activity"
        description="A clear record of human actions, Arc work, approvals, risks, and marketing progress."
      />
      <nav aria-label="Activity time range" className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--border-hairline)]">
        {rangeFilters.map((range) => {
          const active = range.value === selectedRange;
          return (
            <Link
              key={range.value}
              href={range.value === "7d" ? "/activity" : `/activity?range=${range.value}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "relative rounded px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition active:translate-y-px"
                  : "relative rounded px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] active:translate-y-px"
              }
            >
              {range.label}
              {active ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px rounded-full bg-[var(--accent)]" /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function ActivityRail({ entries, summary }: { entries: ActivityEntry[]; summary: ActivitySummary }) {
  const changed = entries
    .filter(
      (e) =>
        e.insightLabel === "Marketing progress" ||
        e.insightLabel === "Data changed" ||
        e.insightLabel === "Customer signal" ||
        e.insightLabel === "Campaign result",
    )
    .slice(0, 4);
  const needsAttention = entries.filter((e) => e.insightLabel === "Needs review" || e.tone === "red").slice(0, 4);
  const arcRuns = entries
    .filter((e) => (e.actorType === "arc" || e.actorType === "sub_agent") && (e.kind === "run" || e.kind === "draft"))
    .slice(0, 4);

  const lastArc = entries.find((e) => e.actorType === "arc" || e.actorType === "sub_agent");
  const lastRisk = entries.find((e) => e.tone === "red" || e.category === "risk");
  const health = [
    { label: "Arc runner", value: "Healthy", tone: "green" as const },
    { label: "Outbound gate", value: "Locked", tone: "amber" as const },
    {
      label: "Last Arc action",
      value: lastArc ? formatTime(lastArc.occurredAt) : "None",
      tone: "blue" as const,
    },
    {
      label: "Open risk flags",
      value: String(summary.blockedOrRisky),
      tone: summary.blockedOrRisky > 0 ? ("red" as const) : ("green" as const),
    },
    {
      label: "Last risk signal",
      value: lastRisk ? formatTime(lastRisk.occurredAt) : "Clear",
      tone: lastRisk ? ("amber" as const) : ("green" as const),
    },
  ];

  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <RailPanel title="Needs your attention" count={summary.needsReview} countTone={summary.needsReview > 0 ? "amber" : "green"}>
        {needsAttention.length > 0 ? (
          <RailList entries={needsAttention} />
        ) : (
          <p className="px-4 py-3.5 text-[11.5px] text-[var(--text-muted)]">Nothing is waiting on you.</p>
        )}
      </RailPanel>

      <RailPanel title="What changed" count={changed.length} countTone="blue">
        {changed.length > 0 ? (
          <RailList entries={changed} />
        ) : (
          <p className="px-4 py-3.5 text-[11.5px] text-[var(--text-muted)]">No forward progress in this range.</p>
        )}
      </RailPanel>

      <RailPanel title="Recent Arc runs" count={arcRuns.length} countTone="blue">
        {arcRuns.length > 0 ? (
          <RailList entries={arcRuns} />
        ) : (
          <p className="px-4 py-3.5 text-[11.5px] text-[var(--text-muted)]">No Arc runs in this range.</p>
        )}
      </RailPanel>

      <RailPanel title="System health" pill={<StatusPill tone="green">Healthy</StatusPill>}>
        <dl className="divide-y divide-[var(--border-hairline)]">
          {health.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 px-4 py-2">
              <dt className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--text-secondary)]">
                <ToneDot tone={row.tone} />
                {row.label}
              </dt>
              <dd className="font-mono text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </RailPanel>
    </aside>
  );
}

function RailPanel({
  title,
  count,
  countTone,
  pill,
  children,
}: {
  title: string;
  count?: number;
  countTone?: "amber" | "green" | "blue";
  pill?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-0">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
        <div className={theme.text.eyebrow}>{title}</div>
        {pill ?? (typeof count === "number" ? <StatusPill tone={countTone ?? "gray"}>{count}</StatusPill> : null)}
      </div>
      {children}
    </Panel>
  );
}

function RailList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ul className="divide-y divide-[var(--border-hairline)]">
      {entries.map((entry) => (
        <RailRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function RailRow({ entry }: { entry: ActivityEntry }) {
  const body = (
    <div className="flex items-start gap-2.5 px-4 py-2 transition-[background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-inset)]">
      <span className="mt-1 shrink-0">
        <ToneDot tone={entry.tone} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold leading-4 text-[var(--text-primary)]">{entry.title}</span>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-[var(--text-muted)]">
          <span className="truncate">{entry.relatedLabel ?? entry.actor}</span>
          <span aria-hidden>&middot;</span>
          <span className="shrink-0 font-mono tabular-nums">{formatTime(entry.occurredAt)}</span>
        </p>
      </div>
    </div>
  );
  return <li>{entry.href ? <Link href={entry.href}>{body}</Link> : body}</li>;
}

function ToneDot({ tone }: { tone: ActivityTone }) {
  const classes: Record<ActivityTone, string> = {
    green: "bg-[var(--ok)]",
    red: "bg-[var(--priority)]",
    amber: "bg-[var(--warn)]",
    blue: "bg-[var(--accent)]",
    gray: "bg-[var(--text-muted)]",
  };

  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${classes[tone]}`} />;
}

function buildActivityStats(summary: ActivitySummary, total: number): StatItem[] {
  return [
    {
      label: "Arc actions",
      value: summary.arcActions,
      hint: "agent work",
      tone: "accent",
      spark: [3, 5, 4, 7, 6, 9, 8],
    },
    {
      label: "Updates",
      value: total,
      hint: "in this view",
      tone: "neutral",
      spark: [6, 7, 5, 8, 7, 9, 11],
    },
    {
      label: "Needs review",
      value: summary.needsReview,
      hint: "waiting on you",
      tone: summary.needsReview > 0 ? "amber" : "ok",
      spark: [1, 2, 2, 3, 2, 4, summary.needsReview || 1],
    },
    {
      label: "Campaigns",
      value: summary.campaignProgress,
      hint: "moved forward",
      tone: "ok",
      spark: [2, 3, 3, 4, 5, 5, 6],
    },
    {
      label: "Blocked / risk",
      value: summary.blockedOrRisky,
      hint: "needs a look",
      tone: summary.blockedOrRisky > 0 ? "red" : "ok",
      spark: [0, 1, 1, 2, 1, 2, summary.blockedOrRisky || 1],
    },
  ];
}

function buildActivityQuery(range: string): ActivityQuery {
  const query: ActivityQuery = { limit: 100 };
  const bounds = rangeBounds(range);
  query.since = bounds.since;
  query.until = bounds.until;
  return query;
}

function rangeBounds(range: string): { since?: string; until?: string } {
  if (range === "all") return {};

  const now = new Date();
  const since = new Date(now);
  if (range === "today") since.setHours(0, 0, 0, 0);
  else if (range === "30d") since.setDate(since.getDate() - 30);
  else since.setDate(since.getDate() - 7);

  return { since: since.toISOString(), until: now.toISOString() };
}

function normalizeRange(value: string): (typeof rangeFilters)[number]["value"] {
  return rangeFilters.some((range) => range.value === value) ? (value as (typeof rangeFilters)[number]["value"]) : "7d";
}

function getString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "No time";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}
