import Link from "next/link";

import { crmObjects } from "../../_data/growth-engine";
import { StatusPill } from "../../_components/page-header";
import { theme } from "../../_components/theme";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

type CrmCommandHeaderProps = {
  activeObject?: CrmObjectKey;
  counts?: Partial<Record<CrmObjectKey, number>>;
};

export function CrmCommandHeader({ activeObject, counts }: CrmCommandHeaderProps) {
  return (
    <section className="signal-panel module-rise mb-4 overflow-hidden">
      <div className="px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1fr)] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">CRM object navigation</span>
              <StatusPill tone="blue">Search per table</StatusPill>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Switch the object lane without changing the page header pattern.</p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
            <div className="text-xs font-medium text-[var(--accent)]">Search lives inside each table</div>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
              Open a CRM object, then use the record table search and page controls to find exactly what you need.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <nav
            aria-label="CRM object navigation"
            className="flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3"
          >
            <Link
              aria-current={!activeObject ? "page" : undefined}
              className={`relative inline-flex min-h-9 shrink-0 cursor-pointer items-center rounded-[8px] px-3 text-sm font-semibold transition ${
                activeObject
                  ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  : "text-[var(--text-primary)]"
              }`}
              href="/crm"
            >
              Home
              {!activeObject ? <span aria-hidden className={theme.control.tabMarker} /> : null}
            </Link>
            {crmObjects.map((object) => {
              const isActive = object.key === activeObject;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`relative inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-sm font-semibold transition ${
                    isActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                  href={object.href}
                  key={object.key}
                >
                  {object.label}
                  <span className={`font-mono text-[11px] ${isActive ? "text-[var(--accent)]" : "text-[var(--accent)] opacity-80"}`}>
                    {counts?.[object.key] ?? 0}
                  </span>
                  {isActive ? <span aria-hidden className={theme.control.tabMarker} /> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
