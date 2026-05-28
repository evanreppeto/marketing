import Link from "next/link";

import { crmObjects } from "../../_data/growth-engine";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

type CrmCommandHeaderProps = {
  activeObject?: CrmObjectKey;
};

export function CrmCommandHeader({ activeObject }: CrmCommandHeaderProps) {
  return (
    <section className="module-rise overflow-hidden rounded-md border border-[#d8dfe8] bg-[#f8fbff] shadow-[0_22px_60px_-44px_rgba(21,35,51,0.42)]">
      <div className="border-b border-[#d8dfe8] bg-white px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[#0f1720]">
              CRM Command Center
            </h1>
            <p className="mt-2 text-sm text-[#63758a]">
              Accounts, contacts, properties, leads, jobs, and outcomes in one operating view.
            </p>
          </div>
          <label className="relative block">
            <span className="sr-only">Search CRM</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d8b9b]">
              <SearchIcon />
            </span>
            <input
              className="h-11 w-full rounded-md border border-[#cfd8e3] bg-[#f8fbff] pl-10 pr-3 text-sm font-medium text-[#162231] outline-none transition placeholder:text-[#7d8b9b] focus:border-[#1769aa] focus:bg-white focus:ring-4 focus:ring-[#1769aa]/10"
              placeholder="Search companies, contacts, properties, leads, jobs"
              readOnly
            />
          </label>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#cfd8e3] bg-white px-4 text-sm font-semibold text-[#1f3247] transition hover:border-[#7c8da0] active:-translate-y-px"
              href="/crm?action=import"
            >
              Import
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#1769aa] px-4 text-sm font-semibold text-white shadow-[0_16px_30px_-24px_rgba(23,105,170,0.95)] transition hover:bg-[#12598f] active:-translate-y-px"
              href="/crm/leads?activity=new"
            >
              New lead
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <nav aria-label="CRM object navigation" className="flex gap-1 overflow-x-auto rounded-md border border-[#d8dfe8] bg-[#eef4fb] p-1">
            <Link
              className={`inline-flex min-h-9 shrink-0 items-center rounded px-3 text-sm font-semibold transition ${
                activeObject
                  ? "text-[#35506c] hover:bg-white hover:text-[#1769aa]"
                  : "bg-white text-[#1769aa] shadow-sm"
              }`}
              href="/crm"
            >
              Home
            </Link>
            {crmObjects.map((object) => {
              const isActive = object.key === activeObject;

              return (
                <Link
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    isActive
                      ? "bg-white text-[#1769aa] shadow-sm"
                      : "text-[#35506c] hover:bg-white hover:text-[#1769aa]"
                  }`}
                  href={object.href}
                  key={object.key}
                >
                  {object.label}
                  <span className="font-mono text-[11px] text-[#7d8b9b]">{object.count}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m12.7 12.7 3.4 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
