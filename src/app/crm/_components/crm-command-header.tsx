import Link from "next/link";

import { crmObjects } from "../../_data/growth-engine";
import { buttonClasses } from "../../_components/page-header";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

type CrmCommandHeaderProps = {
  activeObject?: CrmObjectKey;
  counts?: Partial<Record<CrmObjectKey, number>>;
};

export function CrmCommandHeader({ activeObject, counts }: CrmCommandHeaderProps) {
  return (
    <section className="signal-panel module-rise overflow-hidden">
      <div className="border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              CRM Command Center
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Accounts, contacts, properties, leads, jobs, and outcomes in one operating view.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Search lives inside each table</div>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
              Open a CRM object, then use the record table search and page controls to find exactly what you need.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link className={buttonClasses({ variant: "primary" })} href="/crm/leads?activity=new">
              New lead
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <nav
            aria-label="CRM object navigation"
            className="flex flex-wrap gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1"
          >
            <Link
              aria-current={!activeObject ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded px-3 text-sm font-semibold transition ${
                activeObject
                  ? "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  : "bg-[var(--priority)] text-white shadow-sm"
              }`}
              href="/crm"
            >
              Home
            </Link>
            {crmObjects.map((object) => {
              const isActive = object.key === activeObject;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    isActive
                      ? "bg-[var(--priority)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  }`}
                  href={object.href}
                  key={object.key}
                >
                  {object.label}
                  <span className={`font-mono text-[11px] ${isActive ? "text-white/75" : "text-[var(--accent)]"}`}>
                    {counts?.[object.key] ?? object.count}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
