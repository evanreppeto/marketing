import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, Panel, StatusPill } from "../../_components/page-header";
import {
  crmObjects,
  hyperPersonalizationReference,
  leadEngagementEvents,
  leadHyperPersonaSnapshot,
  leadNextBestActions,
} from "../../_data/growth-engine";
import { CrmCommandHeader } from "./crm-command-header";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

type CrmObjectPageProps = {
  action?: string;
  objectKey: CrmObjectKey;
};

export function CrmObjectPage({ action, objectKey }: CrmObjectPageProps) {
  const crmObject = crmObjects.find((object) => object.key === objectKey);

  if (!crmObject) {
    return null;
  }

  const selectedRow = crmObject.sampleRows[0];

  return (
    <AppShell active="/crm">
      <CrmCommandHeader activeObject={objectKey} />

      <section className="module-rise mt-4 overflow-hidden rounded-md border border-[#d8dfe8] bg-white shadow-[0_22px_60px_-44px_rgba(21,35,51,0.42)]">
        <div className="border-b border-[#d8dfe8] bg-[#f8fbff] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-[#0f1720]">{crmObject.label} workspace</span>
                <StatusPill tone="amber">Mock data</StatusPill>
              </div>
              <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[#63758a]">
                {crmObject.description} List views, record preview, relationship context, and actions are scaffolded
                for the future Supabase-backed CRM.
              </p>
              {objectKey === "leads" ? (
                <div className="mt-3 rounded-md border border-[#c7d8e8] bg-[#eaf4ff] px-3 py-2 text-sm leading-6 text-[#35506c]">
                  <span className="font-semibold text-[#0f1720]">Hyper-personalization reference:</span>{" "}
                  {hyperPersonalizationReference.source} guides persona snapshots, engagement timelines, next-best
                  actions, campaign handoff, and approval guardrails.
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#cfd8e3] bg-white px-4 text-sm font-semibold text-[#1f3247] transition hover:border-[#7c8da0] active:-translate-y-px"
                href={`${crmObject.href}?action=filter`}
              >
                Filter
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#1769aa] px-4 text-sm font-semibold text-white shadow-[0_16px_30px_-24px_rgba(23,105,170,0.95)] transition hover:bg-[#12598f] active:-translate-y-px"
                href={`${crmObject.href}?action=new`}
              >
                New {singularLabel(crmObject.label)}
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 bg-white p-4 md:grid-cols-4">
          {[
            ["Records", crmObject.count, "Sample list"],
            ["Relationships", crmObject.relationships.split("/")[0]?.trim() ?? "Linked"],
            ["Updated", crmObject.lastActivity, "Latest activity"],
            ["Persistence", "Off", "Scaffold mode"],
          ].map(([label, value, detail]) => (
            <div className="rounded-md border border-[#d8dfe8] bg-[#f8fbff] p-4" key={label}>
              <div className="text-xs font-medium text-[#63758a]">{label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.05em] text-[#0f1720]">
                {value}
              </div>
              {detail ? <div className="mt-2 text-xs font-semibold text-[#1769aa]">{detail}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <ActionFeedback
        action={action}
        messages={{
          filter: "Filter previewed. The list is still using mock CRM records.",
          new: `New ${singularLabel(crmObject.label)} previewed. Create forms are not wired yet.`,
        }}
      />

      <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel className="module-rise overflow-hidden border-[#d8dfe8] p-0 [animation-delay:70ms]">
          <div className="flex flex-col gap-3 border-b border-[#e1e7ef] bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">{crmObject.label} list view</h2>
              <p className="mt-1 text-sm text-[#63758a]">Pinned fields mirror a CRM operator list view.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Recently viewed", "My records", "Needs review"].map((view, index) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    index === 0
                      ? "border-[#1769aa] bg-[#eaf4ff] text-[#1769aa]"
                      : "border-[#d8dfe8] bg-white text-[#35506c] hover:border-[#9aabbc]"
                  }`}
                  href={`${crmObject.href}?view=${view.toLowerCase().replaceAll(" ", "-")}`}
                  key={view}
                >
                  {view}
                </Link>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-[#f6f8fb] text-[11px] uppercase tracking-[0.16em] text-[#63758a]">
                  <th className="w-10 px-5 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-3">{crmObject.primaryField}</th>
                  <th className="px-3 py-3">{crmObject.secondaryField}</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {crmObject.sampleRows.map((row) => (
                  <tr className="group transition hover:bg-[#f8fbff]" key={row.name}>
                    <td className="border-t border-[#e1e7ef] px-5 py-4">
                      <span className="block h-4 w-4 rounded border border-[#bdc9d7] bg-white group-hover:border-[#1769aa]" />
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4">
                      <Link className="font-semibold text-[#0f1720] transition hover:text-[#1769aa]" href={`${crmObject.href}/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 text-[#35506c]">{row.detail}</td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 text-[#35506c]">{row.owner}</td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 text-[#63758a]">{row.updated}</td>
                    <td className="border-t border-[#e1e7ef] px-5 py-4">
                      <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise border-[#d8dfe8] [animation-delay:120ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Record preview</h2>
                <p className="mt-1 text-sm text-[#63758a]">Selected from the current list.</p>
              </div>
              <StatusPill tone={statusTone(selectedRow.status)}>{selectedRow.status}</StatusPill>
            </div>
            <div className="mt-5 rounded-md border border-[#c7d8e8] bg-[#eaf4ff] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1769aa]">
                {singularLabel(crmObject.label)}
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0f1720]">
                {selectedRow.name}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#35506c]">{selectedRow.detail}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-[#e1e7ef] bg-white p-3">
                <div className="text-xs text-[#63758a]">Owner</div>
                <div className="mt-1 font-semibold text-[#0f1720]">{selectedRow.owner}</div>
              </div>
              <div className="rounded-md border border-[#e1e7ef] bg-white p-3">
                <div className="text-xs text-[#63758a]">Updated</div>
                <div className="mt-1 font-semibold text-[#0f1720]">{selectedRow.updated}</div>
              </div>
            </div>
            <Link
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#1769aa] px-4 text-sm font-semibold text-white transition hover:bg-[#12598f] active:-translate-y-px"
              href={`${crmObject.href}/${selectedRow.id}`}
            >
              Open record
            </Link>
          </Panel>

          {objectKey === "leads" ? (
            <Panel className="module-rise border-[#d8dfe8] [animation-delay:150ms]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">
                    Hyper-persona snapshot
                  </h2>
                  <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[#63758a]">
                    {hyperPersonalizationReference.thesis}
                  </p>
                </div>
                <div className="shrink-0 rounded-md border border-[#d8dfe8] bg-[#f8fbff] px-3 py-2 font-mono text-xs text-[#35506c]">
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
                  <div className="rounded-md border border-[#e1e7ef] bg-[#f8fbff] p-3" key={label}>
                    <div className="text-xs text-[#63758a]">{label}</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-[#0f1720]">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                <div className="rounded-md border border-[#e1e7ef] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#0f1720]">Next best action</h3>
                      <p className="mt-1 text-sm leading-6 text-[#63758a]">
                        {leadHyperPersonaSnapshot.nextBestAction}
                      </p>
                    </div>
                    <StatusPill tone="green">{leadHyperPersonaSnapshot.confidence}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {leadNextBestActions.map((item) => (
                      <div className="rounded-md border border-[#e1e7ef] bg-[#f8fbff] p-3" key={item.action}>
                        <div className="font-semibold text-[#0f1720]">{item.action}</div>
                        <p className="mt-2 text-sm leading-5 text-[#63758a]">{item.reason}</p>
                        <div className="mt-3 text-xs font-semibold text-[#1769aa]">{item.approval}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-[#e1e7ef] bg-white p-4">
                  <h3 className="font-semibold text-[#0f1720]">Approval guardrails</h3>
                  <div className="mt-3 space-y-2">
                    {leadHyperPersonaSnapshot.riskFlags.map((flag) => (
                      <div className="flex items-center justify-between gap-3 rounded-md bg-[#fff7ed] px-3 py-2 text-sm" key={flag}>
                        <span className="font-mono text-xs text-[#875a07]">{flag}</span>
                        <StatusPill tone="amber">Required</StatusPill>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm leading-6 text-[#63758a]">
                    Offer: <span className="font-semibold text-[#0f1720]">{leadHyperPersonaSnapshot.recommendedOffer}</span>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel className="module-rise border-[#d8dfe8] [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Activity and related work</h2>
            <div className="mt-5 space-y-4">
              {objectKey === "leads"
                ? leadEngagementEvents.map((event) => (
                    <div className="border-b border-[#e1e7ef] pb-4 last:border-0 last:pb-0" key={event.event}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-[#0f1720]">{event.event}</div>
                        <StatusPill tone="blue">{event.channel}</StatusPill>
                      </div>
                      <div className="mt-1 text-xs text-[#63758a]">{event.time}</div>
                      <div className="mt-2 text-sm leading-5 text-[#63758a]">{event.detail}</div>
                    </div>
                  ))
                : [
                    ["Last activity", crmObject.lastActivity],
                    ["Relationships", crmObject.relationships],
                    ["Detail shell", "Ready"],
                    ["Create/edit form", "Not wired"],
                  ].map(([label, detail]) => (
                    <div className="border-b border-[#e1e7ef] pb-4 last:border-0 last:pb-0" key={label}>
                      <div className="font-semibold text-[#0f1720]">{label}</div>
                      <div className="mt-1 text-sm leading-5 text-[#63758a]">{detail}</div>
                    </div>
                  ))}
            </div>
          </Panel>

          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-[#cfd8e3] bg-white px-4 text-sm font-semibold text-[#1f3247] transition hover:border-[#7c8da0] active:-translate-y-px"
            href="/crm"
          >
            Back to CRM home
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}

function statusTone(status: string) {
  if (["Active", "Ready", "Won", "High priority"].includes(status)) {
    return "green";
  }

  if (["Out of scope", "Fix"].includes(status)) {
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
