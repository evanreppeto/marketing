import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../_components/page-header";
import { DataTable } from "../_components/data-table";
import { CrmCommandHeader } from "./_components/crm-command-header";
import { getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";

type CrmViewKey = "calls" | "inspections" | "closed-projects" | "partners";

const crmViews: Array<{ key: CrmViewKey; label: string; detail: string }> = [
  { key: "calls", label: "Calls", detail: "People who need a call before the next step is clear." },
  { key: "inspections", label: "Inspections", detail: "Calls that are ready to become inspection appointments." },
  { key: "closed-projects", label: "Closed projects", detail: "Inspections or jobs ready for closed-project handoff." },
  { key: "partners", label: "Partners", detail: "Referral and trade partner relationship work." },
];

export default async function CrmOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ selected?: string | string[]; view?: string | string[] }>;
}) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const liveCrm = await getCrmOverviewData();
  const isLive = liveCrm.status === "live";
  const workspaceStats = isLive ? liveCrm.stats : [];
  const pipelineRows = isLive ? liveCrm.rows : [];
  const activeView = normalizeView(query.view);
  const selectedId = getValue(query.selected);
  const visibleRows = getVisibleRows(activeView, pipelineRows);
  const selectedRecord = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? pipelineRows[0] ?? null;
  const activeViewMeta = crmViews.find((view) => view.key === activeView) ?? crmViews[0];

  return (
    <AppShell active="/crm">
      <CrmCommandHeader />
      {!isLive ? (
        <div className="module-rise mt-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live CRM unavailable: </span>
          {liveCrm.message}
        </div>
      ) : null}
      <section className="signal-panel module-rise mt-4 overflow-hidden">
        <div className="border-b border-[var(--border-hairline)] px-4 py-3">
          <StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live Supabase CRM" : "Supabase unavailable"}</StatusPill>
        </div>
        <div className="signal-inset grid gap-3 border-b border-[var(--border-hairline)] p-4 md:grid-cols-4">
          {workspaceStats.map((stat) => (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4" key={stat.label}>
              <div className="text-xs font-medium text-[var(--text-muted)]">{stat.label}</div>
              <div className="mt-2 font-display text-2xl font-extrabold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">
                {stat.value}
              </div>
              <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{stat.delta}</div>
              <div className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium leading-5 text-[var(--text-secondary)]">
                {stat.forecast}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:80ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Active CRM list view</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {activeViewMeta.detail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {crmViews.map((view) => (
                <Link
                  aria-current={activeView === view.key ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    activeView === view.key
                      ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                  href={`/crm?view=${view.key}`}
                  key={view.key}
                >
                  {view.label}
                </Link>
              ))}
            </div>
          </div>

          <DataTable
            rows={visibleRows}
            rowKey={(row) => row.id}
            minWidth="min-w-[900px]"
            isSelected={(row) => selectedRecord?.id === row.id}
            columns={[
              {
                key: "select",
                header: <span className="sr-only">Select</span>,
                width: "w-10",
                headClassName: "px-5",
                cellClassName: "px-5",
                cell: (row) => {
                  const isSelected = selectedRecord?.id === row.id;
                  return (
                    <Link
                      aria-label={`Select ${row.record}`}
                      aria-pressed={isSelected}
                      className={`group/selector flex h-8 w-8 items-center justify-center rounded-full border transition active:translate-y-px ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]"
                          : "border-[var(--border-strong)] bg-[var(--surface-inset)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                      }`}
                      href={`/crm?view=${activeView}&selected=${row.id}`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? "border-[var(--on-accent)] bg-[var(--on-accent)]"
                            : "border-[var(--border-strong)] bg-transparent group-hover/selector:border-[var(--accent)]"
                        }`}
                        aria-hidden="true"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full bg-[var(--accent)] transition ${isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} />
                      </span>
                    </Link>
                  );
                },
              },
              {
                key: "record",
                header: "Record",
                cell: (row) => (
                  <>
                    <Link className="font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/crm?view=${activeView}&selected=${row.id}`}>
                      {row.record}
                    </Link>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{row.type}</div>
                  </>
                ),
              },
              { key: "account", header: "Account / contact", cellClassName: "font-medium text-[var(--text-secondary)]", cell: (row) => row.account },
              { key: "stage", header: "Pipeline step", cell: (row) => <StatusPill tone={row.tone}>{row.stage}</StatusPill> },
              { key: "owner", header: "Owner", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.owner },
              { key: "value", header: "Est. value", cellClassName: "font-mono font-semibold tabular-nums text-[var(--text-primary)]", cell: (row) => row.value },
              {
                key: "next",
                header: "Next step",
                cellClassName: "text-[var(--text-secondary)]",
                cell: (row) => (
                  <>
                    <div className="font-medium">{row.nextStep}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{row.updated}</div>
                  </>
                ),
              },
            ]}
            emptyState={<EmptyState title="No CRM records found" detail="Supabase is connected, but this view has no matching records yet." />}
          />
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Record preview</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Pinned from the active list view.</p>
              </div>
              {selectedRecord ? <StatusPill tone={selectedRecord.tone}>Selected</StatusPill> : null}
            </div>
            {selectedRecord ? (
              <>
                <div className="mt-5 rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-4">
                  <div className="signal-eyebrow">Selected record</div>
                  <div className="mt-2 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
                    {selectedRecord.record}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {selectedRecord.account} is ready for {selectedRecord.nextStep.toLowerCase()}.
                  </div>
                </div>
                <div className="signal-inset mt-4 grid grid-cols-3 divide-x divide-[var(--border-hairline)] rounded-md border text-center">
                  {[
                    ["Score", selectedRecord.score],
                    ["Value", selectedRecord.value],
                    ["Owner", selectedRecord.owner],
                  ].map(([label, value]) => (
                    <div className="p-3" key={label}>
                      <div className="text-xs text-[var(--text-muted)]">{label}</div>
                      <div className="mt-1 font-mono text-sm font-semibold text-[var(--text-primary)]">{value}</div>
                    </div>
                  ))}
                </div>
                <Link className={buttonClasses({ variant: "primary", className: "mt-4 w-full" })} href={selectedRecord.href}>
                  Open full record
                </Link>
              </>
            ) : (
              <div className="mt-5">
                <EmptyState title="No record selected" detail="Create or import CRM records, then this panel will show the selected record context." />
              </div>
            )}
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Activity timeline</h2>
            <div className="mt-5">
              <EmptyState title="No CRM events yet" detail="Live engagement events will appear here after event capture is connected." />
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tasks due</h2>
            <div className="mt-5">
              <EmptyState title="No CRM tasks due" detail="Mark-created follow-up tasks will appear here once the enrichment workflow creates them." />
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function normalizeView(value: string | string[] | undefined): CrmViewKey {
  const view = Array.isArray(value) ? value[0] : value;

  if (view === "inspections" || view === "closed-projects" || view === "partners") {
    return view;
  }

  return "calls";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
