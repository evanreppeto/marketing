import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, EmptyState, PageHeader, StatusPill, buttonClasses } from "../../_components/page-header";
import { theme } from "../../_components/theme";
import { crmObjects } from "../../_data/growth-engine";
import { CrmObjectTabs } from "./crm-object-tabs";
import { CrmObjectTable } from "./crm-object-table";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { type CrmNavCounts, type CrmObjectData, type CrmObjectRow } from "@/lib/crm/read-model";

type CrmObjectKey = (typeof crmObjects)[number]["key"];
type CrmListViewKey = "all-records" | "recently-updated" | "needs-review";

type CrmObjectPageProps = {
  action?: string;
  agentName?: string;
  liveObject?: CrmObjectData;
  liveMessage?: string;
  objectKey: CrmObjectKey;
  navCounts?: Extract<CrmNavCounts, { status: "live" }>["counts"];
  selected?: string;
  view?: string;
};

const crmListViews: Array<{ key: CrmListViewKey; label: string; description: string }> = [
  { key: "all-records", label: "All records", description: "Every record in this CRM object." },
  { key: "recently-updated", label: "Recently updated", description: "Newest records first." },
  { key: "needs-review", label: "Needs attention", description: "Records missing useful CRM context or waiting on operator review." },
];

export function CrmObjectPage({ action, liveMessage, liveObject, navCounts, objectKey, selected, view }: CrmObjectPageProps) {
  const fallbackObject = crmObjects.find((object) => object.key === objectKey);
  const crmObject = liveObject ?? (fallbackObject ? { ...fallbackObject, count: 0, relationships: "No linked records", lastActivity: "No activity", sampleRows: [] } : undefined);
  const isLive = Boolean(liveObject);

  if (!crmObject) {
    return null;
  }

  const activeView = normalizeListView(view);
  const activeViewMeta = crmListViews.find((item) => item.key === activeView) ?? crmListViews[0];
  const filteredRows = getRowsForListView(crmObject.sampleRows, activeView);
  const selectedRow = filteredRows.find((row) => row.id === selected) ?? crmObject.sampleRows.find((row) => row.id === selected) ?? filteredRows[0] ?? crmObject.sampleRows[0];
  const showCreateForm = action === "new" && isCrmEntityKey(objectKey);

  return (
    <AppShell active="/crm">
      <PageHeader
        title="CRM Command Center"
        description="A simple starter CRM for accounts, people, assets, leads, projects, outcomes, and the custom fields you add over time."
      />

      {!isLive && liveMessage ? (
        <div className="module-rise mb-4 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-4 py-3 text-sm leading-6 text-[var(--warn-text)]">
          <span className="font-semibold text-[var(--text-primary)]">Live CRM unavailable: </span>
          {liveMessage}
        </div>
      ) : null}

      <CrmObjectTabs activeObject={objectKey} counts={navCounts} />

      <div className="module-rise mt-3 flex flex-col gap-2 border-b border-[var(--border-hairline)] pb-3 text-sm text-[var(--text-secondary)] [animation-delay:55ms] sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[78ch] leading-6">
          <span className="font-semibold text-[var(--text-primary)]">Workspace CRM schema.</span> Core tables stay ready by default; Object studio is where a team can add custom tables, fields, saved views, and reports.
        </p>
        <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "shrink-0 justify-center" })} href="/crm/customize">
          Open Object studio
        </Link>
      </div>

      <ActionFeedback
        action={showCreateForm ? undefined : action}
        messages={{
          filter: "Filter selected.",
          new: isCrmEntityKey(objectKey)
            ? `Create ${singularLabel(crmObject.label).toLowerCase()} below.`
            : `${singularLabel(crmObject.label)} records are created from operations flows.`,
          created: `${singularLabel(crmObject.label)} created.`,
          updated: `${singularLabel(crmObject.label)} updated.`,
          "not-configured": "Supabase is not connected, so nothing was written.",
          "crm-error": "That record could not be saved. Check the fields and try again.",
        }}
      />

      {showCreateForm && isCrmEntityKey(objectKey) ? (
        <div className="mt-4">
          <CrmRecordForm objectKey={objectKey} mode="create" />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0">
          <section className="signal-panel module-rise overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-editorial text-xl font-medium tracking-[-0.012em] text-[var(--text-primary)]">
                    {crmObject.label}
                  </h2>
                  <StatusPill tone="blue">{filteredRows.length} shown</StatusPill>
                </div>
                <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{crmObject.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ObjectViewMenu activeView={activeView} objectHref={crmObject.href} />
                {isCrmEntityKey(objectKey) ? (
                  <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={`${crmObject.href}?action=new`}>
                    New {singularLabel(crmObject.label)}
                  </Link>
                ) : null}
              </div>
            </div>

            <CrmObjectTable
              activeView={activeView}
              activeViewDescription={activeViewMeta.description}
              activeViewLabel={activeViewMeta.label}
              objectHref={crmObject.href}
              objectKey={objectKey}
              objectLabel={crmObject.label}
              primaryField={crmObject.primaryField}
              rows={filteredRows}
              secondaryField={crmObject.secondaryField}
              selectedRecordId={selectedRow?.id}
              views={crmListViews.map((listView) => ({
                ...listView,
                count: getRowsForListView(crmObject.sampleRows, listView.key).length,
                href: `${crmObject.href}?view=${listView.key}`,
              }))}
            />
          </section>
        </main>

        <RecordPreviewPanel crmObject={crmObject} selectedRow={selectedRow} />
      </div>
    </AppShell>
  );
}

function ObjectViewMenu({ activeView, objectHref }: { activeView: CrmListViewKey; objectHref: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3">
      {crmListViews.map((view) => {
        const isActive = activeView === view.key;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex min-h-8 items-center rounded-[8px] px-3 text-xs font-semibold transition ${
              isActive
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            href={view.key === "all-records" ? objectHref : `${objectHref}?view=${view.key}`}
            key={view.key}
          >
            {view.label}
            {isActive ? <span aria-hidden className={theme.control.tabMarker} /> : null}
          </Link>
        );
      })}
    </div>
  );
}

function RecordPreviewPanel({
  crmObject,
  selectedRow,
}: {
  crmObject: Pick<CrmObjectData, "href" | "label">;
  selectedRow?: CrmObjectRow;
}) {
  return (
    <aside className="signal-panel module-rise overflow-hidden p-0 lg:sticky lg:top-5 lg:self-start [animation-delay:70ms]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">Selected record</div>
          {selectedRow ? (
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={selectedRow.href}>
              Open
            </Link>
          ) : null}
        </div>
      </div>
      <div className="p-4">
        {selectedRow ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  className="block break-words font-editorial text-xl font-medium tracking-[-0.014em] text-[var(--text-primary)] transition hover:text-[var(--accent)]"
                  href={selectedRow.href}
                >
                  {selectedRow.name}
                </Link>
                <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{selectedRow.detail}</p>
              </div>
              <StatusPill tone={statusTone(selectedRow.status)}>{selectedRow.status}</StatusPill>
            </div>

            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[var(--accent-contrast)]">Next step</div>
              <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-primary)]">{selectedRow.nextStep}</p>
            </section>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              {quickActions(selectedRow).map((action) => (
                <Link
                  className={buttonClasses({ variant: action.variant, size: "sm", className: "w-full justify-center" })}
                  href={action.href}
                  key={action.label}
                >
                  {action.label}
                </Link>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {[
                ["Persona", humanizeTag(selectedRow.personaTag)],
                ["Updated", formatCrmDate(selectedRow.updated)],
                ["Object", singularLabel(crmObject.label)],
                ["Missing data", selectedRow.missingFields.length === 0 ? "Complete" : selectedRow.missingFields.map(formatMissingField).join(", ")],
              ].map(([label, value]) => (
                <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5" key={label}>
                  <dt className="text-[11px] font-medium text-[var(--text-muted)]">{label}</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">Record checklist</div>
                <StatusPill tone={selectedRow.missingFields.length === 0 ? "green" : "amber"}>
                  {selectedRow.missingFields.length === 0 ? "Complete" : "Cleanup"}
                </StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recordChecklist(selectedRow).map((item) => (
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
            </div>

          </div>
        ) : (
          <EmptyState
            title="No records to preview"
            detail={`This ${singularLabel(crmObject.label).toLowerCase()} object has no rows in the current view yet.`}
          />
        )}
      </div>
    </aside>
  );
}

function statusTone(status: string) {
  if (["Active", "Ready", "Won", "Paid", "High priority", "Qualified", "Validated", "Converted", "Completed"].includes(status)) {
    return "green";
  }

  if (["Out of scope", "Fix", "Lost", "Canceled", "Written Off", "Archived", "Inactive", "Do Not Contact"].includes(status)) {
    return "red";
  }

  return "amber";
}

function singularLabel(label: string) {
  const labels: Record<string, string> = {
    Companies: "Company",
    Contacts: "Contact",
    Assets: "Asset",
    Leads: "Lead",
    Projects: "Project",
    Outcomes: "Outcome",
  };

  return labels[label] ?? label;
}

function normalizeListView(view: string | undefined): CrmListViewKey {
  if (view === "recently-updated" || view === "needs-review") {
    return view;
  }

  return "all-records";
}

function getRowsForListView(rows: readonly CrmObjectRow[], view: CrmListViewKey) {
  if (view === "needs-review") {
    return rows.filter((row) => {
      const status = row.status.toLowerCase();
      return row.missingFields.length > 0 || status.includes("review") || status.includes("pending") || status.includes("out of scope") || status.includes("missing");
    });
  }

  if (view === "recently-updated") {
    return [...rows].sort((a, b) => activityRank(a.updated) - activityRank(b.updated));
  }

  return [...rows];
}

function formatMissingField(value: string) {
  return value.replaceAll("_", " ");
}

function quickActions(selectedRow: CrmObjectRow) {
  const encodedRecord = encodeURIComponent(selectedRow.id);
  return [
    { label: "Create task", href: `/agent-operations?action=new&record=${encodedRecord}`, variant: "ghost" as const },
    { label: "Create project", href: `/crm/jobs?action=new&source=${encodedRecord}`, variant: "ghost" as const },
    { label: "Log outcome", href: `/crm/outcomes?action=new&source=${encodedRecord}`, variant: "ghost" as const },
  ];
}

function recordChecklist(selectedRow: CrmObjectRow) {
  return [
    { label: "Persona", value: selectedRow.personaTag === "unassigned_persona" ? "Missing" : "Set", done: selectedRow.personaTag !== "unassigned_persona" },
    { label: "Linked records", value: `${selectedRow.relationships.length} connected`, done: selectedRow.relationships.length > 0 },
    { label: "Signal", value: typeof selectedRow.score === "number" ? `Score ${selectedRow.score}` : "Unscored", done: typeof selectedRow.score === "number" },
    { label: "Missing data", value: selectedRow.missingFields.length === 0 ? "None" : `${selectedRow.missingFields.length} gaps`, done: selectedRow.missingFields.length === 0 },
  ];
}

function humanizeTag(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityRank(updated: string) {
  if (updated === "Today") {
    return 0;
  }

  if (updated === "Yesterday") {
    return 1;
  }

  const timestamp = Date.parse(updated);
  if (!Number.isNaN(timestamp)) {
    return -timestamp;
  }

  const match = updated.match(/^(\d+)/);
  return match ? Number(match[1]) + 1 : 99;
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
