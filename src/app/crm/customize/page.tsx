import Link from "next/link";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel, StatusPill, buttonClasses } from "../../_components/page-header";
import { crmObjects } from "../../_data/growth-engine";
import { CrmObjectTabs } from "../_components/crm-object-tabs";

const customizationSteps = [
  {
    label: "Tables",
    title: "Choose the records this CRM should track",
    detail: "Start with the standard tables, then add customer-specific tables such as Members, Sponsors, Locations, Deals, Vendors, Events, or Products.",
  },
  {
    label: "Fields",
    title: "Add the columns each team actually needs",
    detail: "Support plain fields such as text, numbers, money, dates, owners, statuses, tags, links, notes, and relationships between tables.",
  },
  {
    label: "Views",
    title: "Save simple working lists",
    detail: "Let users create views for active leads, VIP accounts, missing data, follow-up today, high-value opportunities, or any custom filter.",
  },
  {
    label: "Reports",
    title: "Build reports from the same objects",
    detail: "Individual report pages should read from the customer's tables, fields, and views instead of assuming one industry workflow.",
  },
];

const fieldTypes = ["Text", "Number", "Money", "Date", "Status", "Owner", "Tag", "URL", "Relationship", "Long notes"];

export default function CrmCustomizePage() {
  return (
    <AppShell active="/crm">
      <PageHeader
        title="Customize CRM"
        description="Keep the everyday CRM simple, but let each customer shape the tables, fields, views, and reports around how their business works."
        aside={
          <>
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/crm">
              Back to CRM
            </Link>
            <span className={buttonClasses({ variant: "primary", size: "sm", className: "pointer-events-none" })}>
              Setup model
            </span>
          </>
        }
      />

      <CrmObjectTabs activeBuilder />

      <section className="module-rise mt-4 grid gap-3 lg:grid-cols-4" aria-label="CRM customization model">
        {customizationSteps.map((step) => (
          <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]" key={step.label}>
            <StatusPill tone="blue">{step.label}</StatusPill>
            <h2 className="mt-3 text-base font-bold tracking-[-0.02em] text-[var(--text-primary)]">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{step.detail}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise p-0">
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <div className="signal-eyebrow">Starter tables</div>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Use these as defaults, not limits</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              Customers should be able to rename, hide, extend, or add tables as their CRM grows.
            </p>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {crmObjects.map((object) => (
              <div className="grid gap-3 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_140px]" key={object.key}>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{object.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{object.key}</div>
                </div>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">{object.description}</p>
                <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-center" })} href={object.href}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        </Panel>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <Panel className="module-rise">
            <div className="signal-eyebrow">Field library</div>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Common field types</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {fieldTypes.map((field) => (
                <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]" key={field}>
                  {field}
                </span>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise">
            <div className="signal-eyebrow">Design rule</div>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Reports follow the CRM</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Report pages should not hard-code one industry. They should explain whatever tables, fields, owners, stages, and outcomes the customer configured.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
