import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, EmptyState, Panel, StatusPill, buttonClasses } from "../../_components/page-header";
import { DataTable } from "../../_components/data-table";
import {
  crmObjects,
  hyperPersonalizationReference,
  leadEngagementEvents,
  leadHyperPersonaSnapshot,
  leadNextBestActions,
} from "../../_data/growth-engine";
import { CrmCommandHeader } from "./crm-command-header";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { type CrmObjectData, type CrmObjectRow } from "@/lib/crm/read-model";

type CrmObjectKey = (typeof crmObjects)[number]["key"];
type CrmListViewKey = "recently-viewed" | "my-records" | "needs-review";

type CrmObjectPageProps = {
  action?: string;
  liveObject?: CrmObjectData;
  liveMessage?: string;
  objectKey: CrmObjectKey;
  view?: string;
};

const crmListViews: Array<{ key: CrmListViewKey; label: string; description: string }> = [
  { key: "recently-viewed", label: "Recently viewed", description: "Recently touched CRM records." },
  { key: "my-records", label: "My records", description: "Records owned by Robby." },
  { key: "needs-review", label: "Needs review", description: "Records that need cleanup or operator review." },
];

export function CrmObjectPage({ action, liveMessage, liveObject, objectKey, view }: CrmObjectPageProps) {
  const fallbackObject = crmObjects.find((object) => object.key === objectKey);
  const crmObject = liveObject ?? (fallbackObject ? { ...fallbackObject, count: 0, relationships: "No linked records", lastActivity: "No activity", sampleRows: [] } : undefined);
  const isLive = Boolean(liveObject);

  if (!crmObject) {
    return null;
  }

  const activeView = normalizeListView(view);
  const activeViewMeta = crmListViews.find((item) => item.key === activeView) ?? crmListViews[0];
  const filteredRows = getRowsForListView(crmObject.sampleRows, activeView);
  const LIST_LIMIT = 10;
  const displayedRows = filteredRows.slice(0, LIST_LIMIT);
  const selectedRow = filteredRows[0] ?? crmObject.sampleRows[0];
  const showCreateForm = action === "new" && isCrmEntityKey(objectKey);

  return (
    <AppShell active="/crm">
      <CrmCommandHeader activeObject={objectKey} />

      <section className="signal-panel module-rise mt-4 overflow-hidden">
        <div className="signal-inset border-b border-[var(--border-hairline)] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{crmObject.label} workspace</span>
                <StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live Supabase" : "Supabase unavailable"}</StatusPill>
              </div>
              <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">
                {crmObject.description} List views, record preview, relationship context, and actions are ready for
                Mark-created CRM records.
              </p>
              {!isLive && liveMessage ? (
                <div className="mt-3 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-3 py-2 text-sm leading-6 text-[oklch(0.9_0.09_85)]">
                  <span className="font-semibold">Live data unavailable: </span>
                  {liveMessage}
                </div>
              ) : null}
              {objectKey === "leads" ? (
                <div className="mt-3 rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-3 py-2 text-sm leading-6 text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">Hyper-personalization reference:</span>{" "}
                  {hyperPersonalizationReference.source} guides persona snapshots, engagement timelines, next-best
                  actions, campaign handoff, and approval guardrails.
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link className={buttonClasses({ variant: "ghost" })} href={`${crmObject.href}?action=filter`}>
                Filter
              </Link>
              <Link className={buttonClasses({ variant: "primary" })} href={`${crmObject.href}?action=new`}>
                New {singularLabel(crmObject.label)}
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-4">
          {[
            ["Records", crmObject.count, "Live list"],
            ["Relationships", crmObject.relationships.split("/")[0]?.trim() ?? "Linked"],
            ["Updated", crmObject.lastActivity, "Latest activity"],
            ["Persistence", isLive ? "On" : "Unavailable", isLive ? "Supabase live" : "Check connection"],
          ].map(([label, value, detail]) => (
            <div className="signal-inset rounded-md border p-4" key={label}>
              <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">
                {value}
              </div>
              {detail ? <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{detail}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <ActionFeedback
        action={showCreateForm ? undefined : action}
        messages={{
          filter: "Filter selected.",
          new: isCrmEntityKey(objectKey)
            ? `Create ${singularLabel(crmObject.label).toLowerCase()} below.`
            : objectKey === "leads"
              ? "Leads are created through Lead Intake so they keep their scoring and routing."
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

      <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:70ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{crmObject.label} list view</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {activeViewMeta.description} Showing {displayedRows.length} of {filteredRows.length}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {crmListViews.map((listView) => (
                <Link
                  aria-current={activeView === listView.key ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    activeView === listView.key
                      ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                  href={`${crmObject.href}?view=${listView.key}`}
                  key={listView.key}
                >
                  {listView.label}
                  <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{getRowsForListView(crmObject.sampleRows, listView.key).length}</span>
                </Link>
              ))}
            </div>
          </div>

          <DataTable
            rows={displayedRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "select",
                header: <span className="sr-only">Select</span>,
                width: "w-10",
                headClassName: "px-5",
                cellClassName: "px-5",
                cell: () => (
                  <span className="block h-4 w-4 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] group-hover:border-[var(--accent)]" />
                ),
              },
              {
                key: "primary",
                header: crmObject.primaryField,
                cellClassName: "max-w-[34ch]",
                cell: (row) => (
                  <Link className="line-clamp-1 font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`${crmObject.href}/${row.id}`}>
                    {row.name}
                  </Link>
                ),
              },
              { key: "secondary", header: crmObject.secondaryField, cellClassName: "max-w-[30ch] text-[var(--text-secondary)]", cell: (row) => <span className="line-clamp-2">{row.detail}</span> },
              { key: "owner", header: "Owner", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.owner },
              { key: "updated", header: "Updated", cellClassName: "text-[var(--text-muted)]", cell: (row) => row.updated },
              {
                key: "status",
                header: "Status",
                headClassName: "px-5",
                cellClassName: "px-5",
                cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>,
              },
            ]}
            emptyState={
              <p className="text-sm text-[var(--text-secondary)]">No {activeViewMeta.label.toLowerCase()} records found.</p>
            }
          />

          <div className="grid border-t border-[var(--border-hairline)] md:grid-cols-3">
            {[
              ["Completeness", objectKey === "leads" ? "Validation + persona required" : "Required fields mapped"],
              ["Relationship rule", crmObject.relationships],
              ["Next connection", "Create forms and saved list filters"],
            ].map(([label, detail]) => (
              <div className="border-b border-[var(--border-hairline)] px-5 py-4 md:border-r md:last:border-r-0" key={label}>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
                <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{detail}</div>
              </div>
            ))}
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Record preview</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Selected from the current list.</p>
              </div>
              {selectedRow ? <StatusPill tone={statusTone(selectedRow.status)}>{selectedRow.status}</StatusPill> : null}
            </div>
            {selectedRow ? (
              <>
                <div className="mt-5 rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-4">
                  <div className="signal-eyebrow">
                    {singularLabel(crmObject.label)}
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
                    {selectedRow.name}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selectedRow.detail}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="signal-inset rounded-md border p-3">
                    <div className="text-xs text-[var(--text-muted)]">Owner</div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">{selectedRow.owner}</div>
                  </div>
                  <div className="signal-inset rounded-md border p-3">
                    <div className="text-xs text-[var(--text-muted)]">Updated</div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">{selectedRow.updated}</div>
                  </div>
                </div>
                <Link className={buttonClasses({ variant: "primary", className: "mt-4 w-full" })} href={`${crmObject.href}/${selectedRow.id}`}>
                  Open record
                </Link>
              </>
            ) : (
              <div className="mt-5">
                <EmptyState
                  title="No records to preview"
                  detail={`This ${singularLabel(crmObject.label).toLowerCase()} object has no rows in the current view yet.`}
                />
              </div>
            )}
          </Panel>

          {objectKey === "leads" ? (
            <Panel className="module-rise [animation-delay:150ms]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                    Hyper-persona snapshot
                  </h2>
                  <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
                    {hyperPersonalizationReference.thesis}
                  </p>
                </div>
                <div className="signal-inset shrink-0 rounded-md border px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                  {hyperPersonalizationReference.source}
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-4">
                {[
                  ["Base persona", leadHyperPersonaSnapshot.basePersona],
                  ["Relationship stage", leadHyperPersonaSnapshot.relationshipStage],
                  ["Loss pattern", leadHyperPersonaSnapshot.dominantLossPattern],
                  ["Preferred channel", leadHyperPersonaSnapshot.preferredChannel],
                ].map(([label, value]) => (
                  <div className="signal-inset rounded-md border p-3" key={label}>
                    <div className="text-xs text-[var(--text-muted)]">{label}</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-[var(--text-primary)]">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                <div className="signal-inset rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)]">Next best action</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {leadHyperPersonaSnapshot.nextBestAction}
                      </p>
                    </div>
                    <StatusPill tone="green">{leadHyperPersonaSnapshot.confidence}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {leadNextBestActions.map((item) => (
                      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={item.action}>
                        <div className="font-semibold text-[var(--text-primary)]">{item.action}</div>
                        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{item.reason}</p>
                        <div className="mt-3 text-xs font-semibold text-[var(--accent)]">{item.approval}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="signal-inset rounded-md border p-4">
                  <h3 className="font-semibold text-[var(--text-primary)]">Approval guardrails</h3>
                  <div className="mt-3 space-y-2">
                    {leadHyperPersonaSnapshot.riskFlags.map((flag) => (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-[oklch(0.82_0.13_85/0.3)] bg-[oklch(0.82_0.13_85/0.12)] px-3 py-2 text-sm" key={flag}>
                        <span className="font-mono text-xs text-[oklch(0.9_0.09_85)]">{flag}</span>
                        <StatusPill tone="amber">Required</StatusPill>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                    Offer: <span className="font-semibold text-[var(--text-primary)]">{leadHyperPersonaSnapshot.recommendedOffer}</span>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Activity and related work</h2>
            <div className="mt-5 space-y-4">
              {objectKey === "leads"
                ? leadEngagementEvents.map((event) => (
                    <div className="border-b border-[var(--border-hairline)] pb-4 last:border-0 last:pb-0" key={event.event}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-[var(--text-primary)]">{event.event}</div>
                        <StatusPill tone="blue">{event.channel}</StatusPill>
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{event.time}</div>
                      <div className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{event.detail}</div>
                    </div>
                  ))
                : [
                    ["Last activity", crmObject.lastActivity],
                    ["Relationships", crmObject.relationships],
                    ["Detail shell", "Ready"],
                    ["Create/edit form", "Not wired"],
                  ].map(([label, detail]) => (
                    <div className="border-b border-[var(--border-hairline)] pb-4 last:border-0 last:pb-0" key={label}>
                      <div className="font-semibold text-[var(--text-primary)]">{label}</div>
                      <div className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{detail}</div>
                    </div>
                  ))}
            </div>
          </Panel>

          <Link className={buttonClasses({ variant: "ghost" })} href="/crm">
            Back to CRM home
          </Link>
        </aside>
      </div>
    </AppShell>
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
    Properties: "Property",
    Leads: "Lead",
    Jobs: "Job",
    Outcomes: "Outcome",
  };

  return labels[label] ?? label;
}

function normalizeListView(view: string | undefined): CrmListViewKey {
  if (view === "my-records" || view === "needs-review") {
    return view;
  }

  return "recently-viewed";
}

function getRowsForListView(rows: readonly CrmObjectRow[], view: CrmListViewKey) {
  if (view === "my-records") {
    return rows.filter((row) => row.owner === "Robby");
  }

  if (view === "needs-review") {
    return rows.filter((row) => ["Review", "Out of scope", "Pending"].includes(row.status));
  }

  return [...rows].sort((a, b) => activityRank(a.updated) - activityRank(b.updated));
}

function activityRank(updated: string) {
  if (updated === "Today") {
    return 0;
  }

  if (updated === "Yesterday") {
    return 1;
  }

  const match = updated.match(/^(\d+)/);
  return match ? Number(match[1]) + 1 : 99;
}
