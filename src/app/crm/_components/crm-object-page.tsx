import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, PageHeader, StatusPill, buttonClasses } from "../../_components/page-header";
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
  view?: string;
};

const crmListViews: Array<{ key: CrmListViewKey; label: string; description: string }> = [
  { key: "all-records", label: "All records", description: "Every record in this CRM object." },
  { key: "recently-updated", label: "Recently updated", description: "Newest records first." },
  { key: "needs-review", label: "Needs attention", description: "Records missing useful CRM context or waiting on operator review." },
];

export function CrmObjectPage({ action, liveMessage, liveObject, navCounts, objectKey, view }: CrmObjectPageProps) {
  const fallbackObject = crmObjects.find((object) => object.key === objectKey);
  const crmObject = liveObject ?? (fallbackObject ? { ...fallbackObject, count: 0, relationships: "No linked records", lastActivity: "No activity", sampleRows: [] } : undefined);
  const isLive = Boolean(liveObject);

  if (!crmObject) {
    return null;
  }

  const activeView = normalizeListView(view);
  const activeViewMeta = crmListViews.find((item) => item.key === activeView) ?? crmListViews[0];
  const filteredRows = getRowsForListView(crmObject.sampleRows, activeView);
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

      <section className="signal-panel module-rise mt-4 overflow-hidden p-0">
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
          {isCrmEntityKey(objectKey) ? (
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={`${crmObject.href}?action=new`}>
              New {singularLabel(crmObject.label)}
            </Link>
          ) : null}
        </div>

        <CrmObjectTable
          activeView={activeView}
          activeViewDescription={activeViewMeta.description}
          activeViewLabel={activeViewMeta.label}
          objectKey={objectKey}
          objectLabel={crmObject.label}
          primaryField={crmObject.primaryField}
          rows={filteredRows}
          secondaryField={crmObject.secondaryField}
          views={crmListViews.map((listView) => ({
            ...listView,
            count: getRowsForListView(crmObject.sampleRows, listView.key).length,
            href: `${crmObject.href}?view=${listView.key}`,
          }))}
        />
      </section>
    </AppShell>
  );
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

