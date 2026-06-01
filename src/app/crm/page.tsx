import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { DataTable } from "../_components/data-table";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { DetailStack, MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import { getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";

type CrmViewKey = "leads" | "companies" | "contacts" | "campaign-ready" | "jobs";

const crmViews: Array<{ key: CrmViewKey; label: string; detail: string; href: string }> = [
  { key: "leads", label: "Leads", detail: "New, validated, qualified, and routed opportunities.", href: "/crm/leads" },
  { key: "companies", label: "Companies", detail: "Partners, referral sources, and target accounts.", href: "/crm/companies" },
  { key: "contacts", label: "Contacts", detail: "People Mark can enrich or recommend follow-up for.", href: "/crm/contacts" },
  { key: "campaign-ready", label: "Campaign ready", detail: "Records with enough context for Mark to draft.", href: "/approvals" },
  { key: "jobs", label: "Jobs", detail: "Outcome loop and future BSR Manager sync.", href: "/crm/jobs" },
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
  const requestedView = getValue(query.view);
  const activeView = normalizeView(requestedView);
  const selectedId = getValue(query.selected);
  const visibleRows = getVisibleRows(activeView, pipelineRows);
  const selectedRecord = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? pipelineRows[0] ?? null;
  const activeViewMeta = crmViews.find((view) => view.key === activeView) ?? crmViews[0];

  return (
    <AppShell active="/crm">
      <WorkspaceHeader
        eyebrow="CRM workbench"
        title="The memory layer for growth work."
        description="Companies, contacts, leads, jobs, and outcomes are organized as operational records Mark can use, but humans still own approval decisions."
        status={isLive ? "Live Supabase CRM" : "Supabase unavailable"}
        statusTone={isLive ? "green" : "amber"}
        primary={{ label: "Review leads", href: "/crm/leads" }}
        secondary={{ label: "Approval queue", href: "/approvals" }}
      />

      {!isLive ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live CRM unavailable: </span>
          {liveCrm.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={
          workspaceStats.length > 0
            ? workspaceStats.map((stat, index) => ({
                label: stat.label,
                value: stat.value,
                detail: `${stat.delta}. ${stat.forecast}`,
                tone: index === 0 ? ("amber" as const) : index === 3 ? ("green" as const) : ("blue" as const),
              }))
            : [
                { label: "Leads", value: 0, detail: "Waiting on live CRM connection", tone: "amber" as const },
                { label: "Companies", value: 0, detail: "No live data", tone: "gray" as const },
                { label: "Jobs", value: 0, detail: "No live data", tone: "gray" as const },
                { label: "Revenue", value: "$0", detail: "No live data", tone: "gray" as const },
              ]
        }
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Record tabs"
            title="Choose the operating view"
            description="The CRM is split by the way Mark and the team actually use the data."
          >
            <div className="grid gap-2 p-4 md:grid-cols-5">
              {crmViews.map((view) => {
                const isActive = activeView === view.key;
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-lg border px-3 py-3 transition ${
                      isActive
                        ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:bg-[var(--surface-raised)]"
                    }`}
                    href={`/crm?view=${view.key}`}
                    key={view.key}
                  >
                    <div className="text-sm font-bold text-[var(--text-primary)]">{view.label}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{view.detail}</p>
                  </Link>
                );
              })}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            className="p-0"
            eyebrow={activeViewMeta.label}
            title="Active records"
            description={activeViewMeta.detail}
            aside={<StatusPill tone={visibleRows.length > 0 ? "blue" : "gray"}>{visibleRows.length} visible</StatusPill>}
          >
            <DataTable
              rows={visibleRows}
              rowKey={(row) => row.id}
              minWidth="min-w-[920px]"
              isSelected={(row) => selectedRecord?.id === row.id}
              columns={[
                {
                  key: "record",
                  header: "Record",
                  cell: (row) => (
                    <>
                      <Link className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/crm?view=${activeView}&selected=${row.id}`}>
                        {row.record}
                      </Link>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{row.type}</div>
                    </>
                  ),
                },
                { key: "account", header: "Account", cellClassName: "font-medium text-[var(--text-secondary)]", cell: (row) => row.account },
                { key: "stage", header: "Stage", cell: (row) => <StatusPill tone={row.tone}>{row.stage}</StatusPill> },
                { key: "owner", header: "Owner", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.owner },
                { key: "score", header: "Score / value", cellClassName: "font-mono font-semibold tabular-nums", cell: (row) => row.value },
                {
                  key: "next",
                  header: "Next action",
                  cellClassName: "text-[var(--text-secondary)]",
                  cell: (row) => (
                    <>
                      <div className="font-medium text-[var(--text-primary)]">{row.nextStep}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{row.updated}</div>
                    </>
                  ),
                },
              ]}
              emptyState={<EmptyState title="No records in this view" detail="The database is connected, but this slice has no matching CRM records yet." />}
            />
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <WorkspacePanel
            eyebrow="Selected record"
            title={selectedRecord?.record ?? "No record selected"}
            description={selectedRecord ? `${selectedRecord.account} / ${selectedRecord.type}` : "Select a row to see record context."}
            aside={selectedRecord ? <StatusPill tone={selectedRecord.tone}>{selectedRecord.stage}</StatusPill> : null}
          >
            {selectedRecord ? (
              <>
                <DetailStack
                  items={[
                    { label: "Owner", value: selectedRecord.owner },
                    { label: "Value", value: selectedRecord.value },
                    { label: "Score", value: `${selectedRecord.score}/100` },
                    { label: "Next action", value: selectedRecord.nextStep },
                    { label: "Updated", value: selectedRecord.updated },
                  ]}
                />
                <div className="border-t border-[var(--border-hairline)] p-4">
                  <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={selectedRecord.href}>
                    Open full record
                  </Link>
                </div>
              </>
            ) : (
              <div className="p-4">
                <EmptyState title="No record selected" detail="Create or import CRM records, then this panel will show the selected record context." />
              </div>
            )}
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Mark can use this" title="Recommended follow-up">
            <div className="space-y-3 p-4">
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
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

function normalizeView(value: string | string[] | undefined): CrmViewKey {
  const view = Array.isArray(value) ? value[0] : value;

  if (view === "companies" || view === "contacts" || view === "campaign-ready" || view === "jobs") {
    return view;
  }

  return "leads";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getVisibleRows(activeView: CrmViewKey, rows: CrmPipelineRow[]) {
  if (activeView === "leads") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep} ${row.type}`.toLowerCase();
      return text.includes("lead") || text.includes("review") || text.includes("qualified") || text.includes("book");
    });
  }

  if (activeView === "companies") {
    return rows.filter((row) => {
      const text = `${row.record} ${row.account} ${row.type}`.toLowerCase();
      return text.includes("company") || text.includes("partner") || text.includes("referral") || text.includes("insurance");
    });
  }

  if (activeView === "contacts") {
    return rows.filter((row) => {
      const text = `${row.record} ${row.account} ${row.type}`.toLowerCase();
      return text.includes("contact") || text.includes("manager") || text.includes("agent");
    });
  }

  if (activeView === "campaign-ready") {
    return rows.filter((row) => row.score >= 70);
  }

  if (activeView === "jobs") {
    return rows.filter((row) => {
      const text = `${row.record} ${row.stage} ${row.type} ${row.nextStep}`.toLowerCase();
      return text.includes("job") || text.includes("inspection") || text.includes("outcome") || text.includes("completed");
    });
  }

  return rows;
}
