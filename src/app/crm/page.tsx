import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { crmObjects, crmScaffoldStats } from "../_data/growth-engine";

export default function CrmOverviewPage() {
  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow="CRM Scaffold"
        title="Companies, contacts, properties, jobs"
        description="Every core CRM object has a route, list shell, and detail page. Supabase reads, writes, and edit forms come later."
        aside={<StatusPill tone="amber">Mock preview</StatusPill>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {crmScaffoldStats.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[#6e6962]">{stat.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]">{stat.value}</div>
            <div className="mt-3 inline-flex rounded-md bg-[#fff3d9] px-2 py-1 text-xs font-semibold text-[#875a07]">
              {stat.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <Panel className="module-rise p-0 [animation-delay:120ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">CRM objects</h2>
            <p className="mt-1 text-sm text-[#6e6962]">The six-object model from the project architecture.</p>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {crmObjects.map((object) => (
              <Link
                className="group flex min-h-44 flex-col border-b border-[#eee8e1] p-5 transition hover:bg-[#fbfaf8] md:border-r even:md:border-r-0 active:-translate-y-px"
                href={object.href}
                key={object.key}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{object.label}</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-[#6e6962]">{object.description}</p>
                  </div>
                  <div className="font-mono text-3xl font-semibold tracking-[-0.05em]">{object.count}</div>
                </div>
                <div className="mt-3 font-mono text-xs text-[#6e6962]">{object.relationships}</div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="text-xs text-[#7a736b]">Last activity {object.lastActivity}</div>
                  <div className="text-sm font-semibold text-[#e7352f]">Open scaffold</div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">What is included now</h2>
            <div className="mt-5 space-y-4">
              {[
                ["Routes", "Overview plus six object pages"],
                ["Rows", "Mock samples for layout testing"],
                ["Detail pages", "Mock record pages for every object"],
                ["Actions", "URL-backed scaffold placeholders"],
              ].map(([label, detail]) => (
                <div className="border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={label}>
                  <div className="font-semibold">{label}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{detail}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Persistence not connected</h2>
            <p className="mt-3 text-sm leading-6 text-[#6e6962]">
              No Supabase queries, mutations, real edit forms, or record activity timelines were added in this pass.
              Pages render against mock data only.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
