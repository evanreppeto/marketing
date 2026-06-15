import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { PageHeader, StatusPill, buttonClasses } from "../_components/page-header";
import { getCrmNavCounts, getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import { CrmObjectTabs } from "./_components/crm-object-tabs";
import { CrmPipelineBoard } from "./_components/crm-pipeline-board";

type CrmViewKey = "needs-action" | "new" | "qualified" | "scheduled" | "closed";

type CrmSearchParams = {
  selected?: string | string[];
  view?: string | string[];
};

const listViews: Array<{ key: CrmViewKey; label: string }> = [
  { key: "needs-action", label: "Needs Action" },
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "scheduled", label: "Scheduled" },
  { key: "closed", label: "Closed" },
];

export default async function CrmOverviewPage({ searchParams }: { searchParams?: Promise<CrmSearchParams> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const [liveCrm, navCounts, agentName] = await Promise.all([getCrmOverviewData(), getCrmNavCounts(), getAgentName()]);
  const isLive = liveCrm.status === "live";
  const pipelineRows = isLive ? liveCrm.rows : [];
  const counts = navCounts.status === "live" ? navCounts.counts : undefined;
  const activeView = normalizeView(getValue(query.view));
  const visibleRows = getVisibleRows(activeView, pipelineRows);
  const selectedId = getValue(query.selected);
  const selectedRecord = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? pipelineRows[0] ?? null;
  const focusStats = buildFocusStats(pipelineRows);

  return (
    <AppShell active="/crm">
      <PageHeader
        title="CRM Command Center"
        description="A simple starter CRM for accounts, people, assets, leads, projects, outcomes, and the custom fields you add over time."
      />

      {!isLive ? (
        <div className="module-rise mb-4 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-4 py-3 text-sm leading-6 text-[var(--warn-text)]">
          <span className="font-semibold text-[var(--text-primary)]">Live CRM unavailable: </span>
          {liveCrm.message}
        </div>
      ) : null}

      <CrmObjectTabs counts={counts} />

      <CrmFocusStrip stats={focusStats} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 space-y-4">
          <section className="signal-panel module-rise overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                    Leads: Working List
                  </h2>
                  <StatusPill tone="blue">{visibleRows.length} shown</StatusPill>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Review scored leads, relationships, and projects, then open the full CRM record when the next step is clear.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ViewMenu activeView={activeView} />
                <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/crm/leads?action=new">
                  New Lead
                </Link>
              </div>
            </div>

            <CrmPipelineBoard activeView={activeView} rows={visibleRows} selectedRecordId={selectedRecord?.id ?? null} />
          </section>
        </main>

        <SelectedRecordPanel selectedRecord={selectedRecord} agentName={agentName} />
      </div>
    </AppShell>
  );
}

function CrmFocusStrip({ stats }: { stats: ReturnType<typeof buildFocusStats> }) {
  return (
    <section className="module-rise mt-4 grid gap-2 lg:grid-cols-3" aria-label="Today's CRM work">
      {stats.map((item) => (
        <Link
          className="group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--elev-panel)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
          href={item.href}
          key={item.label}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.label}</div>
              <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{item.detail}</div>
            </div>
            <span className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-sm font-bold ${item.tone}`}>
              {item.value}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function ViewMenu({ activeView }: { activeView: CrmViewKey }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
      {listViews.map((view) => (
        <Link
          aria-current={activeView === view.key ? "page" : undefined}
          className={`inline-flex min-h-8 items-center rounded px-3 text-xs font-semibold transition ${
            activeView === view.key
              ? "bg-[var(--accent)] text-[var(--on-accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          }`}
          href={view.key === "needs-action" ? "/crm" : `/crm?view=${view.key}`}
          key={view.key}
        >
          {view.label}
        </Link>
      ))}
    </div>
  );
}

function SelectedRecordPanel({ selectedRecord, agentName }: { selectedRecord: CrmPipelineRow | null; agentName: string }) {
  if (!selectedRecord) {
    return (
      <aside className="signal-panel module-rise p-5 xl:sticky xl:top-5 xl:self-start">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Selected lead</div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">No CRM records are available yet. Connect Supabase or create a record to populate this workbench.</p>
      </aside>
    );
  }

  const leadScoreTone = selectedRecord.score >= 75 ? "green" : selectedRecord.score >= 55 ? "amber" : "red";
  const source = humanizeTag(selectedRecord.sourceTag);
  const interest = selectedRecord.serviceTags[0] ? humanizeTag(selectedRecord.serviceTags[0]) : "General interest";
  const revenue = selectedRecord.value.includes("/") || selectedRecord.value === "Partner" ? "$5,000 - $15,000" : selectedRecord.value;
  const keyFacts = [
    ["Contact", contactNameFromRow(selectedRecord)],
    ["Interest", interest],
    ["Account", selectedRecord.account],
    ["Revenue", revenue],
    ["Owner", selectedRecord.owner || agentName],
    ["Source", source],
  ];

  return (
    <aside className="signal-panel module-rise overflow-hidden p-0 xl:sticky xl:top-5 xl:self-start [animation-delay:70ms]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">Selected record</div>
        <div className="flex items-center gap-2">
          <StatusPill tone="amber">Draft locked</StatusPill>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={selectedRecord.href}>
            Open
          </Link>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/agent-operations?action=new&record=${selectedRecord.id}`}>
            Task
          </Link>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h2 className="break-words font-display text-xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {selectedRecord.record}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={selectedRecord.tone}>{selectedRecord.stage}</StatusPill>
            <StatusPill tone={leadScoreTone}>Score {selectedRecord.score}</StatusPill>
          </div>
        </div>

        <section className="rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] p-3">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Next step</div>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-primary)]">{selectedRecord.nextStep}</p>
        </section>

        <dl className="grid grid-cols-2 gap-2">
          {keyFacts.map(([label, value]) => (
            <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5" key={label}>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ready check</h3>
            <StatusPill tone={selectedRecord.missingTags.length === 0 ? "green" : "amber"}>
              {selectedRecord.missingTags.length === 0 ? "Ready" : "Needs data"}
            </StatusPill>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {readinessItems(selectedRecord).map((item) => (
              <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${
                  item.done
                    ? "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
                    : "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn-text)]"
                }`}
                key={item.label}
                title={`${item.label}: ${item.value}`}
              >
                <span className="text-[var(--text-muted)]">{item.label}</span>
                <span className="truncate">{item.value}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function normalizeView(value: string | string[] | undefined): CrmViewKey {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "new" || view === "qualified" || view === "scheduled" || view === "closed") return view;
  return "needs-action";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getVisibleRows(activeView: CrmViewKey, rows: CrmPipelineRow[]) {
  if (activeView === "needs-action") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep} ${row.lifecycleTag}`.toLowerCase();
      return text.includes("new") || text.includes("review") || text.includes("call") || text.includes("book") || text.includes("follow");
    });
  }

  if (activeView === "new") {
    return rows.filter((row) => `${row.stage} ${row.lifecycleTag}`.toLowerCase().includes("new"));
  }

  if (activeView === "qualified") {
    return rows.filter((row) => `${row.stage} ${row.lifecycleTag}`.toLowerCase().includes("qualified"));
  }

  if (activeView === "scheduled") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep}`.toLowerCase();
      return text.includes("scheduled") || text.includes("schedule") || text.includes("meeting") || text.includes("appointment");
    });
  }

  return rows.filter((row) => {
    const text = `${row.stage} ${row.lifecycleTag} ${row.nextStep}`.toLowerCase();
    return text.includes("won") || text.includes("lost") || text.includes("converted") || text.includes("outcome") || text.includes("archive");
  });
}

function buildFocusStats(rows: CrmPipelineRow[]) {
  const callFirst = rows.filter((row) => {
    const text = `${row.stage} ${row.nextStep}`.toLowerCase();
    return row.score >= 70 || text.includes("call") || text.includes("book");
  }).length;
  const needsData = rows.filter((row) => row.missingTags.length > 0).length;
  const opportunityReady = rows.filter((row) => {
    const text = `${row.stage} ${row.nextStep} ${row.lifecycleTag}`.toLowerCase();
    return text.includes("qualified") || text.includes("scheduled") || text.includes("schedule") || text.includes("converted");
  }).length;

  return [
    {
      label: "Call first",
      detail: "Highest intent leads and partner follow-ups.",
      value: callFirst,
      href: "/crm",
      tone: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent)]",
    },
    {
      label: "Needs data",
      detail: "Records missing score, source, evidence, or service tags.",
      value: needsData,
      href: "/crm?view=needs-action",
      tone: "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn-text)]",
    },
    {
      label: "Opportunity ready",
      detail: "Qualified, scheduled, or conversion-ready records.",
      value: opportunityReady,
      href: "/crm?view=scheduled",
      tone: "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]",
    },
  ];
}

function readinessItems(row: CrmPipelineRow) {
  return [
    { label: "Contact path", value: contactNameFromRow(row) ? "Known" : "Missing", done: Boolean(contactNameFromRow(row)) },
    { label: "Interest", value: row.serviceTags.length > 0 ? humanizeTag(row.serviceTags[0]) : "Missing", done: row.serviceTags.length > 0 },
    { label: "Lead score", value: `${row.score}/100`, done: row.score >= 55 },
    { label: "Data gaps", value: row.missingTags.length === 0 ? "None" : `${row.missingTags.length} gaps`, done: row.missingTags.length === 0 },
  ];
}

function contactNameFromRow(row: CrmPipelineRow) {
  if (row.record.length <= 34) return row.record;
  return row.account;
}

function humanizeTag(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
