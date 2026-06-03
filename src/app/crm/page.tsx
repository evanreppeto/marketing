import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../_components/page-header";
import { getCrmNavCounts, getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";

import { CrmCommandHeader } from "./_components/crm-command-header";
import { CrmPipelineBoard } from "./_components/crm-pipeline-board";

type CrmViewKey = "calls" | "inspections" | "closed-projects" | "partners";
type CrmTabKey = "overview" | "pipeline" | "record" | "activity";

const crmViews: Array<{ key: CrmViewKey; label: string; detail: string }> = [
  { key: "calls", label: "Calls", detail: "People who need a call before the next step is clear." },
  { key: "inspections", label: "Inspections", detail: "Calls that are ready to become inspection appointments." },
  { key: "closed-projects", label: "Closed projects", detail: "Inspections or jobs ready for closed-project handoff." },
  { key: "partners", label: "Partners", detail: "Referral and trade partner relationship work." },
];

const crmTabs: Array<{ key: CrmTabKey; label: string; detail: string }> = [
  { key: "overview", label: "Overview", detail: "Totals and the main CRM work buckets." },
  { key: "pipeline", label: "Pipeline", detail: "Focused table view for the active CRM list." },
  { key: "record", label: "Record", detail: "Selected record context and open action." },
  { key: "activity", label: "Activity", detail: "Events and tasks due." },
];

type CrmSearchParams = {
  selected?: string | string[];
  view?: string | string[];
  tab?: string | string[];
};

export default async function CrmOverviewPage({ searchParams }: { searchParams?: Promise<CrmSearchParams> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const [liveCrm, navCounts] = await Promise.all([getCrmOverviewData(), getCrmNavCounts()]);
  const isLive = liveCrm.status === "live";
  const workspaceStats = isLive ? liveCrm.stats : [];
  const pipelineRows = isLive ? liveCrm.rows : [];
  const requestedView = getValue(query.view);
  const activeView = requestedView ? normalizeView(requestedView) : pickDefaultCrmView(pipelineRows);
  const activeTab = normalizeTab(getValue(query.tab));
  const selectedId = getValue(query.selected);
  const visibleRows = getVisibleRows(activeView, pipelineRows);
  const selectedRecord = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? pipelineRows[0] ?? null;
  const activeViewMeta = crmViews.find((view) => view.key === activeView) ?? crmViews[0];

  return (
    <AppShell active="/crm">
      <CrmCommandHeader counts={navCounts.status === "live" ? navCounts.counts : undefined} />

      {!isLive ? (
        <div className="module-rise mt-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live CRM unavailable: </span>
          {liveCrm.message}
        </div>
      ) : null}

      <CrmTabs activeTab={activeTab} query={query} activeView={activeView} selectedId={selectedRecord?.id ?? null} />

      {activeTab === "overview" ? <CrmOverview stats={workspaceStats} rows={pipelineRows} activeView={activeView} /> : null}
      {activeTab === "pipeline" ? (
        <CrmPipeline
          activeView={activeView}
          activeViewMeta={activeViewMeta}
          rows={visibleRows}
          selectedRecord={selectedRecord}
        />
      ) : null}
      {activeTab === "record" ? <CrmRecordPreview selectedRecord={selectedRecord} /> : null}
      {activeTab === "activity" ? <CrmActivity /> : null}
    </AppShell>
  );
}

function CrmTabs({
  activeTab,
  query,
  activeView,
  selectedId,
}: {
  activeTab: CrmTabKey;
  query: CrmSearchParams;
  activeView: CrmViewKey;
  selectedId: string | null;
}) {
  return (
    <nav aria-label="CRM page sections" className="module-rise mt-4 grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)] md:grid-cols-4">
      {crmTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`rounded-lg border px-4 py-3 transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
              isActive
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[0_0_20px_oklch(0.74_0.115_232/0.18)]"
                : "border-transparent bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            }`}
            href={crmHref(query, { tab: tab.key, view: activeView, selected: selectedId })}
            key={tab.key}
          >
            <span className="block text-sm font-bold">{tab.label}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{tab.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function CrmOverview({ stats, rows, activeView }: { stats: Array<{ label: string; value: string | number; delta: string; forecast: string }>; rows: CrmPipelineRow[]; activeView: CrmViewKey }) {
  return (
    <div className="mt-4 space-y-4">
      <section className="signal-panel module-rise overflow-hidden">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">CRM overview</span>
            <StatusPill tone={stats.length > 0 ? "green" : "amber"}>{stats.length > 0 ? "Live Supabase CRM" : "Supabase unavailable"}</StatusPill>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">Pick the slice before digging into records.</h2>
          <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
            This page should answer one question at a time: what exists, what needs action, which record is selected, or what happened recently.
          </p>
        </div>

        <div className="signal-inset grid gap-3 border-b border-[var(--border-hairline)] p-4 md:grid-cols-4">
          {stats.length > 0 ? (
            stats.map((stat) => (
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4" key={stat.label}>
                <div className="text-xs font-medium text-[var(--text-muted)]">{stat.label}</div>
                <div className="mt-2 font-display text-2xl font-extrabold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">{stat.value}</div>
                <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{stat.delta}</div>
                <div className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium leading-5 text-[var(--text-secondary)]">
                  {stat.forecast}
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="CRM stats unavailable" detail="Connect Supabase to show live CRM totals." />
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {crmViews.map((view) => {
          const count = getVisibleRows(view.key, rows).length;
          const isActive = activeView === view.key;
          return (
            <Link
              className={`rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_20px_oklch(0.74_0.115_232/0.18)]"
                  : "border-[var(--border-panel)] bg-[var(--surface-panel)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
              }`}
              href={`/crm?tab=pipeline&view=${view.key}`}
              key={view.key}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{view.label}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{view.detail}</p>
                </div>
                <StatusPill tone={count > 0 ? "blue" : "gray"}>{count}</StatusPill>
              </div>
              <div className="mt-4 text-sm font-bold text-[var(--accent)]">Open pipeline</div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function CrmPipeline({
  activeView,
  activeViewMeta,
  rows,
  selectedRecord,
}: {
  activeView: CrmViewKey;
  activeViewMeta: { label: string; detail: string };
  rows: CrmPipelineRow[];
  selectedRecord: CrmPipelineRow | null;
}) {
  return (
    <Panel className="module-rise mt-4 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Active CRM list view</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{activeViewMeta.detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {crmViews.map((view) => (
            <Link
              aria-current={activeView === view.key ? "page" : undefined}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
                activeView === view.key
                  ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[0_0_18px_oklch(0.74_0.115_232/0.18)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--chicago-blue-soft)]"
              }`}
              href={`/crm?tab=pipeline&view=${view.key}`}
              key={view.key}
            >
              {view.label}
            </Link>
          ))}
        </div>
      </div>

      <CrmPipelineBoard activeView={activeView} rows={rows} selectedRecordId={selectedRecord?.id ?? null} />
    </Panel>
  );
}

function CrmRecordPreview({ selectedRecord }: { selectedRecord: CrmPipelineRow | null }) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="module-rise overflow-hidden">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words font-display text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
              {selectedRecord?.record ?? "No record selected"}
            </h2>
            <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
              {selectedRecord ? `${selectedRecord.account} / ${selectedRecord.type}` : "Select a pipeline row to inspect it here."}
            </p>
          </div>
          {selectedRecord ? <StatusPill tone={selectedRecord.tone}>{selectedRecord.stage}</StatusPill> : null}
        </div>

        {selectedRecord ? (
          <>
            <div className="signal-inset mt-5 grid gap-0 overflow-hidden rounded-md border md:grid-cols-3">
              {[
                ["Score", selectedRecord.score],
                ["Value", selectedRecord.value],
                ["Owner", selectedRecord.owner],
              ].map(([label, value]) => (
                <div className="min-w-0 border-b border-r border-[var(--border-hairline)] p-4" key={label}>
                  <div className="text-xs text-[var(--text-muted)]">{label}</div>
                  <div className="mt-1 break-words font-mono text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-4">
              <div className="signal-eyebrow">Next step</div>
              <p className="mt-2 text-base font-semibold leading-6 text-[var(--text-primary)]">{selectedRecord.nextStep}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Updated {formatCrmDate(selectedRecord.updated)}. Outbound remains locked from this record view.
              </p>
            </div>
            <Link className={buttonClasses({ variant: "primary", className: "mt-5" })} href={selectedRecord.href}>
              Open full record
            </Link>
          </>
        ) : (
          <div className="mt-5">
            <EmptyState title="No record selected" detail="Open the Pipeline tab and choose a CRM row." />
          </div>
        )}
      </Panel>

      <Panel className="module-rise">
        <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Mark can use this</h3>
        <div className="mt-4 space-y-3">
          {[
            ["Enrich", "Fill missing company, contact, and source evidence."],
            ["Classify", "Attach persona and relationship stage."],
            ["Draft", "Create approval-ready outreach only after enough context exists."],
          ].map(([label, detail]) => (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3" key={label}>
              <div className="text-sm font-bold text-[var(--text-primary)]">{label}</div>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CrmActivity() {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel className="module-rise">
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Activity timeline</h2>
        <div className="mt-5">
          <EmptyState title="No CRM events yet" detail="Live engagement events will appear here after event capture is connected." />
        </div>
      </Panel>

      <Panel className="module-rise">
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tasks due</h2>
        <div className="mt-5">
          <EmptyState title="No CRM tasks due" detail="Mark-created follow-up tasks will appear here once the enrichment workflow creates them." />
        </div>
      </Panel>
    </div>
  );
}

function normalizeView(value: string | string[] | undefined): CrmViewKey {
  const view = Array.isArray(value) ? value[0] : value;

  if (view === "inspections" || view === "closed-projects" || view === "partners") {
    return view;
  }

  return "calls";
}

function normalizeTab(value: string | string[] | undefined): CrmTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "pipeline" || tab === "record" || tab === "activity") return tab;
  return "overview";
}

function pickDefaultCrmView(rows: CrmPipelineRow[]): CrmViewKey {
  return crmViews.find((view) => getVisibleRows(view.key, rows).length > 0)?.key ?? "calls";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function crmHref(query: CrmSearchParams, next: { tab?: CrmTabKey; view?: CrmViewKey; selected?: string | null }) {
  const params = new URLSearchParams();
  const tab = next.tab ?? normalizeTab(query.tab);
  const view = next.view ?? normalizeView(query.view);
  const selected = next.selected ?? getValue(query.selected);

  if (tab !== "overview") params.set("tab", tab);
  if (view !== "calls") params.set("view", view);
  if (selected) params.set("selected", selected);

  const serialized = params.toString();
  return serialized ? `/crm?${serialized}` : "/crm";
}

function formatCrmDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getVisibleRows(activeView: CrmViewKey, rows: CrmPipelineRow[]) {
  if (activeView === "calls") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep}`.toLowerCase();
      return text.includes("call") || text.includes("book");
    });
  }

  if (activeView === "inspections") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep}`.toLowerCase();
      return text.includes("inspection") || text.includes("schedule");
    });
  }

  if (activeView === "closed-projects") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep} ${row.type}`.toLowerCase();
      return text.includes("closed project") || text.includes("close") || text.includes("job");
    });
  }

  if (activeView === "partners") {
    return rows.filter((row) => {
      const text = `${row.record} ${row.account} ${row.type} ${row.stage}`.toLowerCase();
      return text.includes("partner") || text.includes("referral") || text.includes("insurance");
    });
  }

  return rows;
}
