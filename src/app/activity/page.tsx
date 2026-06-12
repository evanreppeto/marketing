import Link from "next/link";
import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import {
  getRecentActivity,
  type ActivityActorType,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityQuery,
  type ActivityTone,
} from "@/lib/activity/read-model";

export const metadata = {
  title: "Activity",
};

type ActivityPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const categoryFilters: Array<{
  label: string;
  value: ActivityCategory | "all" | "needs-review" | "humans" | "hermes";
}> = [
  { label: "All", value: "all" },
  { label: "Needs review", value: "needs-review" },
  { label: "Humans", value: "humans" },
  { label: "Hermes", value: "hermes" },
  { label: "Approvals", value: "approval" },
  { label: "Campaigns", value: "campaign" },
  { label: "CRM", value: "crm" },
  { label: "Assets", value: "asset" },
  { label: "Integrations", value: "integration" },
  { label: "Risk", value: "risk" },
];

const rangeFilters = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
] as const;

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  await connection();

  const params = await searchParams;
  const selectedFilter = normalizeFilter(getString(params.filter));
  const selectedRange = normalizeRange(getString(params.range));
  const search = getString(params.q);
  const query = buildActivityQuery(selectedFilter, selectedRange, search);
  const activity = await getRecentActivity(query);

  if (activity.status === "unavailable") {
    return (
      <>
        <ActivityHeader />
        <EmptyState
          title="Activity will appear once the workspace is connected"
          detail="The log uses workspace records, agent runs, approvals, campaigns, and CRM events."
        />
      </>
    );
  }

  const visibleActivity = selectedFilter === "needs-review" ? filterNeedsReviewActivity(activity) : activity;

  return (
    <>
      <ActivityHeader />

      <MetricStrip
        metrics={[
          {
            label: "Needs review",
            value: visibleActivity.summary.needsReview,
            detail:
              visibleActivity.summary.needsReview > 0
                ? `${visibleActivity.summary.needsReview} ${plural(visibleActivity.summary.needsReview, "item")} waiting on a decision.`
                : "Nothing is waiting on you.",
            tone: visibleActivity.summary.needsReview > 0 ? "amber" : "green",
            href: visibleActivity.summary.needsReview > 0 ? "/activity?filter=needs-review" : undefined,
          },
          {
            label: "Hermes actions",
            value: visibleActivity.summary.hermesActions,
            detail:
              visibleActivity.summary.hermesActions > 0
                ? `${visibleActivity.summary.hermesActions} ${plural(visibleActivity.summary.hermesActions, "agent action")} in this view.`
                : "No Hermes work in this range.",
            tone: visibleActivity.summary.hermesActions > 0 ? "blue" : "gray",
            href: visibleActivity.summary.hermesActions > 0 ? "/activity?filter=hermes" : undefined,
          },
          {
            label: "Campaign progress",
            value: visibleActivity.summary.campaignProgress,
            detail:
              visibleActivity.summary.campaignProgress > 0
                ? `${visibleActivity.summary.campaignProgress} ${plural(visibleActivity.summary.campaignProgress, "campaign update")} moved forward.`
                : "No campaign movement in this range.",
            tone: visibleActivity.summary.campaignProgress > 0 ? "green" : "gray",
            href: visibleActivity.summary.campaignProgress > 0 ? "/activity?filter=campaign" : undefined,
          },
          {
            label: "Blocked or risky",
            value: visibleActivity.summary.blockedOrRisky,
            detail:
              visibleActivity.summary.blockedOrRisky > 0
                ? `${visibleActivity.summary.blockedOrRisky} ${plural(visibleActivity.summary.blockedOrRisky, "risk")} needs a closer look.`
                : "No risk events in this range.",
            tone: visibleActivity.summary.blockedOrRisky > 0 ? "red" : "green",
            href: visibleActivity.summary.blockedOrRisky > 0 ? "/activity?filter=risk" : undefined,
          },
        ]}
      />

      <WorkspacePanel
        title="Workspace log"
        description="A plain-English record of what people, Hermes, integrations, and the system have done across the workspace."
        aside={<ResultCount count={visibleActivity.entries.length} />}
      >
        <ActivityFilters selectedFilter={selectedFilter} selectedRange={selectedRange} search={search} />

        {visibleActivity.groups.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {visibleActivity.groups.map((group) => (
              <section key={group.label} aria-labelledby={`activity-${slug(group.label)}`}>
                <div className="bg-[var(--surface-soft)] px-5 py-3">
                  <h2
                    id={`activity-${slug(group.label)}`}
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                  >
                    {group.label}
                  </h2>
                </div>
                <ul className="divide-y divide-[var(--border-hairline)]">
                  {group.entries.map((entry) => (
                    <ActivityRow entry={entry} key={entry.id} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No activity found" detail="Try widening the date range or clearing a filter." />
          </div>
        )}
      </WorkspacePanel>
    </>
  );
}

function ActivityHeader() {
  return (
    <div className="mb-5">
      <PageHeader
        eyebrow="Workspace log"
        title="Activity"
        description="A clear record of human actions, Hermes work, approvals, risks, and marketing progress."
      />
    </div>
  );
}

function ActivityFilters({
  selectedFilter,
  selectedRange,
  search,
}: {
  selectedFilter: string;
  selectedRange: string;
  search: string;
}) {
  return (
    <div className="space-y-3 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] px-5 py-4">
      <div className="flex flex-wrap gap-2" aria-label="Activity category filters">
        {categoryFilters.map((filter) => (
          <FilterLink
            active={selectedFilter === filter.value}
            href={activityHref({ filter: filter.value, range: selectedRange, q: search })}
            key={filter.value}
          >
            {filter.label}
          </FilterLink>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Activity date filters">
          {rangeFilters.map((range) => (
            <FilterLink
              active={selectedRange === range.value}
              href={activityHref({ filter: selectedFilter, range: range.value, q: search })}
              key={range.value}
            >
              {range.label}
            </FilterLink>
          ))}
        </div>

        <form action="/activity" className="flex min-w-0 gap-2">
          <input name="filter" type="hidden" value={selectedFilter} />
          <input name="range" type="hidden" value={selectedRange} />
          <label className="sr-only" htmlFor="activity-search">
            Search activity
          </label>
          <input
            className="min-h-11 w-full min-w-[220px] rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border-strong)]"
            defaultValue={search}
            id="activity-search"
            name="q"
            placeholder="Search activity"
            type="search"
          />
          <button
            className="min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)]"
            type="submit"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
}

function FilterLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const body = (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ToneDot tone={entry.tone} />
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.actor}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">{actorLabel(entry.actorType)}</div>
      </div>

      <div className="min-w-0">
        <div className="font-medium leading-6 text-[var(--text-primary)]">{entry.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-5 text-[var(--text-secondary)]">
          {entry.relatedLabel ? <span>{entry.relatedLabel}</span> : null}
          {entry.relatedLabel ? <span aria-hidden="true">&middot;</span> : null}
          <span>{entry.detail}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {entry.insightLabel ? <StatusPill tone={pillTone(entry.tone)}>{entry.insightLabel}</StatusPill> : null}
        <time className="text-xs font-medium text-[var(--text-muted)]" dateTime={entry.occurredAt}>
          {formatTime(entry.occurredAt)}
        </time>
      </div>
    </div>
  );

  return <li>{entry.href ? <Link href={entry.href}>{body}</Link> : body}</li>;
}

function ResultCount({ count }: { count: number }) {
  return <StatusPill tone={count > 0 ? "blue" : "gray"}>{count} shown</StatusPill>;
}

function buildActivityQuery(filter: string, range: string, search: string): ActivityQuery {
  const query: ActivityQuery = { limit: 100 };

  if (filter === "humans") query.actorTypes = ["human"];
  else if (filter === "hermes") query.actorTypes = ["hermes", "sub_agent"];
  else if (isCategory(filter)) query.categories = [filter];

  const bounds = rangeBounds(range);
  query.since = bounds.since;
  query.until = bounds.until;

  query.search = search || undefined;

  return query;
}

type LiveActivity = Extract<Awaited<ReturnType<typeof getRecentActivity>>, { status: "live" }>;

function filterNeedsReviewActivity(activity: LiveActivity): LiveActivity {
  const entries = activity.entries.filter(isNeedsReviewEntry);

  return {
    ...activity,
    entries,
    summary: buildDisplayedSummary(entries),
    groups: activity.groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter(isNeedsReviewEntry),
      }))
      .filter((group) => group.entries.length > 0),
  };
}

function isNeedsReviewEntry(entry: ActivityEntry) {
  return entry.insightLabel === "Needs review";
}

function buildDisplayedSummary(entries: ActivityEntry[]): LiveActivity["summary"] {
  return {
    needsReview: entries.filter((entry) => entry.insightLabel === "Needs review").length,
    hermesActions: entries.filter((entry) => entry.actorType === "hermes" || entry.actorType === "sub_agent").length,
    campaignProgress: entries.filter(
      (entry) => entry.category === "campaign" || entry.insightLabel === "Marketing progress",
    ).length,
    blockedOrRisky: entries.filter(
      (entry) => entry.category === "risk" || entry.tone === "red" || entry.insightLabel === "Risk blocked",
    ).length,
  };
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

function isCategory(value: string): value is ActivityCategory {
  return ["approval", "campaign", "crm", "asset", "agent", "integration", "risk", "system"].includes(value);
}

function normalizeFilter(value: string): ActivityCategory | "all" | "needs-review" | "humans" | "hermes" {
  if (value === "needs-review" || value === "humans" || value === "hermes") return value;
  if (isCategory(value)) return value;
  return "all";
}

function normalizeRange(value: string): (typeof rangeFilters)[number]["value"] {
  return rangeFilters.some((range) => range.value === value) ? (value as (typeof rangeFilters)[number]["value"]) : "7d";
}

function getString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function activityHref({ filter, range, q }: { filter: string; range: string; q: string }) {
  const params = new URLSearchParams();
  if (filter && filter !== "all") params.set("filter", filter);
  if (range && range !== "7d") params.set("range", range);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

function actorLabel(actorType: ActivityActorType) {
  if (actorType === "human") return "Human";
  if (actorType === "hermes") return "Hermes";
  if (actorType === "sub_agent") return "Sub-agent";
  if (actorType === "integration") return "Integration";
  return "System";
}

function ToneDot({ tone }: { tone: ActivityTone }) {
  const classes: Record<ActivityTone, string> = {
    green: "bg-[var(--ok)]",
    red: "bg-[var(--priority)]",
    amber: "bg-[var(--warn)]",
    blue: "bg-[var(--accent)]",
    gray: "bg-[var(--text-muted)]",
  };

  return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${classes[tone]}`} />;
}

function pillTone(tone: ActivityTone) {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "No time";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
