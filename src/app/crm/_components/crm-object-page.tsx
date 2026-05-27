import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../../_components/page-header";
import { crmObjects } from "../../_data/growth-engine";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

type CrmObjectPageProps = {
  objectKey: CrmObjectKey;
};

export function CrmObjectPage({ objectKey }: CrmObjectPageProps) {
  const crmObject = crmObjects.find((object) => object.key === objectKey);

  if (!crmObject) {
    return null;
  }

  const selectedRow = crmObject.sampleRows[0];

  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow="CRM Scaffold"
        title={`${crmObject.label} workspace`}
        description={`${crmObject.description} This is scaffolding only: list layout, mock rows, and detail shell are ready for live data later.`}
        aside={<StatusPill tone="amber">Mock data only</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">{crmObject.label}</h2>
              <p className="mt-1 text-sm text-[#6e6962]">
                {crmObject.count} sample records shown in scaffold mode.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition active:-translate-y-px">
                Filter
              </button>
              <button className="min-h-11 rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition active:-translate-y-px">
                New {crmObject.label.slice(0, -1)}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">{crmObject.primaryField}</th>
                  <th className="px-4 py-4">{crmObject.secondaryField}</th>
                  <th className="px-4 py-4">Owner</th>
                  <th className="px-4 py-4">Updated</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {crmObject.sampleRows.map((row) => (
                  <tr key={row.name}>
                    <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">
                      <Link className="transition hover:text-[#e7352f]" href={`${crmObject.href}/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.detail}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4">{row.owner}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.updated}</td>
                    <td className="border-t border-[#eee8e1] px-5 py-4">
                      <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Record preview</h2>
            <div className="mt-5 rounded-md bg-[#151515] p-5 text-white">
              <div className="text-sm uppercase tracking-[0.16em] text-white/55">Selected record</div>
              <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{selectedRow.name}</div>
              <p className="mt-3 text-sm leading-6 text-white/68">{selectedRow.detail}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
                <div className="text-sm text-[#6e6962]">Owner</div>
                <div className="mt-2 font-semibold">{selectedRow.owner}</div>
              </div>
              <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
                <div className="text-sm text-[#6e6962]">Updated</div>
                <div className="mt-2 font-semibold">{selectedRow.updated}</div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Scaffold boundaries</h2>
            <div className="mt-5 space-y-4">
              {[
                ["List route", "Ready"],
                ["Detail shell", "Ready"],
                ["Create/edit form", "Not wired"],
                ["Supabase reads", "Not wired"],
              ].map(([label, state]) => (
                <div className="flex items-center justify-between gap-4 border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={label}>
                  <div className="font-semibold">{label}</div>
                  <StatusPill tone={state === "Ready" ? "green" : "amber"}>{state}</StatusPill>
                </div>
              ))}
            </div>
          </Panel>

          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition active:-translate-y-px"
            href="/crm"
          >
            Back to CRM overview
          </Link>
        </div>
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
