import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "../../_components/page-header";
import { crmObjects } from "../../_data/growth-engine";
import { CrmCommandHeader } from "./crm-command-header";
import { CrmObjectTable } from "./crm-object-table";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { type CrmNavCounts, type CrmObjectData, type CrmObjectRow } from "@/lib/crm/read-model";

type CrmObjectKey = (typeof crmObjects)[number]["key"];
type CrmListViewKey = "all-records" | "recently-updated" | "needs-review";
type CrmObjectSectionKey = "records" | "intelligence" | "activity";

type CrmObjectPageProps = {
  action?: string;
  agentName?: string;
  liveObject?: CrmObjectData;
  liveMessage?: string;
  objectKey: CrmObjectKey;
  navCounts?: Extract<CrmNavCounts, { status: "live" }>["counts"];
  section?: string;
  view?: string;
};

const crmListViews: Array<{ key: CrmListViewKey; label: string; description: string }> = [
  { key: "all-records", label: "All records", description: "Every record in this CRM object." },
  { key: "recently-updated", label: "Recently updated", description: "Newest records first." },
  { key: "needs-review", label: "Needs review", description: "Records that need cleanup or operator review." },
];

function buildObjectSections(agentName: string): Array<{ key: CrmObjectSectionKey; label: string; detail: string }> {
  return [
    { key: "records", label: "Records", detail: "Search, filter, and open CRM rows." },
    { key: "intelligence", label: "Intelligence", detail: `Persona rules, gaps, and ${agentName} guidance.` },
    { key: "activity", label: "Activity", detail: "Related events and next work." },
  ];
}

export function CrmObjectPage({ action, agentName = "Agent", liveMessage, liveObject, navCounts, objectKey, section, view }: CrmObjectPageProps) {
  const fallbackObject = crmObjects.find((object) => object.key === objectKey);
  const crmObject = liveObject ?? (fallbackObject ? { ...fallbackObject, count: 0, relationships: "No linked records", lastActivity: "No activity", sampleRows: [] } : undefined);
  const isLive = Boolean(liveObject);

  if (!crmObject) {
    return null;
  }

  const activeView = normalizeListView(view);
  const activeSection = normalizeObjectSection(section);
  const activeViewMeta = crmListViews.find((item) => item.key === activeView) ?? crmListViews[0];
  const filteredRows = getRowsForListView(crmObject.sampleRows, activeView);
  const selectedRow = filteredRows[0] ?? crmObject.sampleRows[0];
  const showCreateForm = action === "new" && isCrmEntityKey(objectKey);

  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow="CRM object"
        title={`${crmObject.label} workspace`}
        description={`${crmObject.description} List views, record preview, relationship context, and actions are ready for ${agentName}-created CRM records.`}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live Supabase" : "Supabase unavailable"}</StatusPill>
            <Link className={buttonClasses({ variant: "primary" })} href={`${crmObject.href}?action=new`}>
              New {singularLabel(crmObject.label)}
            </Link>
          </div>
        }
      />
      <CrmCommandHeader activeObject={objectKey} counts={navCounts} />

      <section className="signal-panel module-rise mt-4 overflow-hidden">
        <div className="signal-inset border-b border-[var(--border-hairline)] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">Object workspace</span>
              </div>
              <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">
                Record metrics, table views, relationship context, and live actions for this CRM object.
              </p>
              {!isLive && liveMessage ? (
                <div className="mt-3 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-3 py-2 text-sm leading-6 text-[oklch(0.9_0.09_85)]">
                  <span className="font-semibold">Live data unavailable: </span>
                  {liveMessage}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Records", crmObject.count, "Live list"],
            ["Relationships", crmObject.relationships.split("/")[0]?.trim() ?? "Linked"],
            ["Updated", crmObject.lastActivity, "Latest activity"],
            ["Persistence", isLive ? "On" : "Unavailable", isLive ? "Supabase live" : "Check connection"],
          ].map(([label, value, detail]) => (
            <div className="signal-inset min-w-0 rounded-md border px-3 py-2.5" key={label}>
              <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
              <div className="mt-1 truncate font-mono text-lg font-semibold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">
                {value}
              </div>
              {detail ? <div className="mt-1 text-xs font-semibold text-[var(--accent)]">{detail}</div> : null}
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

      <ObjectSectionTabs activeSection={activeSection} agentName={agentName} objectHref={crmObject.href} view={activeView} />

      {activeSection === "records" ? (
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:70ms]">
          <CrmObjectTable
            activeView={activeView}
            activeViewDescription={activeViewMeta.description}
            activeViewLabel={activeViewMeta.label}
            objectHref={crmObject.href}
            objectLabel={crmObject.label}
            primaryField={crmObject.primaryField}
            rows={filteredRows}
            secondaryField={crmObject.secondaryField}
            views={crmListViews.map((listView) => ({
              ...listView,
              count: getRowsForListView(crmObject.sampleRows, listView.key).length,
              href: `${crmObject.href}?section=records&view=${listView.key}`,
            }))}
          />
        </Panel>
      ) : null}

      {activeSection === "intelligence" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="module-rise [animation-delay:70ms]">
            <div className="signal-eyebrow">Intelligence contract</div>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
              {agentName} needs clean relationship context before outreach drafts.
            </h2>
            <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              This object is ready for scoring tags, evidence links, relationship maturity, and next-best-action fields.
              Missing values should stay visible as data contracts, not fake operational data.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Persona", objectKey === "companies" ? "Partner or referral source" : "Record-specific persona"],
                ["Confidence", "Needs source evidence"],
                ["CTA rule", objectKey === "contacts" ? "Human-approved relationship touch" : "Approval queue only"],
                ["Guardrail", "Outbound locked"],
              ].map(([label, detail]) => (
                <div className="signal-inset rounded-md border p-3" key={label}>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
                  <div className="mt-1 text-sm font-bold text-[var(--text-primary)]">{detail}</div>
                </div>
              ))}
            </div>
          </Panel>

          <RecordPreviewPanel crmObject={crmObject} selectedRow={selectedRow} />
        </div>
      ) : null}

      {activeSection === "activity" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="module-rise [animation-delay:70ms]">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Activity and related work</h2>
            <div className="mt-5 space-y-4">
              {[
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

          <RecordPreviewPanel crmObject={crmObject} selectedRow={selectedRow} />
        </div>
      ) : null}

      <div className="mt-4">
        <Link className={buttonClasses({ variant: "ghost" })} href="/crm">
          Back to CRM home
        </Link>
      </div>
    </AppShell>
  );
}

function ObjectSectionTabs({
  activeSection,
  agentName,
  objectHref,
  view,
}: {
  activeSection: CrmObjectSectionKey;
  agentName: string;
  objectHref: string;
  view: CrmListViewKey;
}) {
  const objectSections = buildObjectSections(agentName);
  return (
    <section className="module-rise mt-4 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          {agentName} prepares CRM context. Humans approve anything outbound.
        </p>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>
      <nav aria-label="CRM object sections" className="grid gap-2 p-2 md:grid-cols-3">
        {objectSections.map((section) => {
          const isActive = activeSection === section.key;
          const params = new URLSearchParams();
          if (section.key !== "records") params.set("section", section.key);
          if (view !== "all-records" && section.key === "records") params.set("view", view);
          const href = params.toString() ? `${objectHref}?${params.toString()}` : objectHref;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`rounded-lg border px-4 py-3 transition duration-200 active:translate-y-px ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-transparent bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              }`}
              href={href}
              key={section.key}
            >
              <span className="block text-sm font-bold">{section.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{section.detail}</span>
            </Link>
          );
        })}
      </nav>
    </section>
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
    <Panel className="module-rise [animation-delay:120ms]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Record preview</h2>
          <p className="mt-1 max-w-[30ch] text-sm leading-5 text-[var(--text-secondary)]">
            First matching row from the active view. Open a row for full detail.
          </p>
        </div>
        {selectedRow ? <StatusPill tone={statusTone(selectedRow.status)}>{selectedRow.status}</StatusPill> : null}
      </div>
      {selectedRow ? (
        <>
          <div className="mt-5 rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-4">
            <div className="signal-eyebrow">{singularLabel(crmObject.label)}</div>
            <div className="mt-2 break-words font-display text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
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
              <div className="mt-1 break-words font-semibold text-[var(--text-primary)]">{formatCrmDate(selectedRow.updated)}</div>
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
  if (view === "recently-updated" || view === "needs-review") {
    return view;
  }

  return "all-records";
}

function normalizeObjectSection(section: string | undefined): CrmObjectSectionKey {
  if (section === "intelligence" || section === "activity") {
    return section;
  }

  return "records";
}

function getRowsForListView(rows: readonly CrmObjectRow[], view: CrmListViewKey) {
  if (view === "needs-review") {
    return rows.filter((row) => {
      const status = row.status.toLowerCase();
      return status.includes("review") || status.includes("pending") || status.includes("out of scope") || status.includes("missing");
    });
  }

  if (view === "recently-updated") {
    return [...rows].sort((a, b) => activityRank(a.updated) - activityRank(b.updated));
  }

  return [...rows];
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
