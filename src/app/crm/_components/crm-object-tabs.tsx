import Link from "next/link";

import { crmObjects } from "../../_data/growth-engine";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

const objectTabOrder = [
  { key: "home", label: "Home", href: "/crm" },
  ...crmObjects.map((object) => ({
    key: object.key,
    label: object.label,
    href: object.href,
  })),
];

export function CrmObjectTabs({
  activeObject,
  counts,
}: {
  activeObject?: CrmObjectKey;
  counts?: Partial<Record<CrmObjectKey, number>>;
}) {
  return (
    <section className="signal-panel module-rise overflow-hidden p-0 [animation-delay:40ms]">
      <nav aria-label="CRM object tabs" className="flex overflow-x-auto">
        {objectTabOrder.map((tab) => {
          const isHome = tab.key === "home";
          const isActive = isHome ? !activeObject : tab.key === activeObject;
          const count = !isHome ? counts?.[tab.key as CrmObjectKey] : undefined;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 shrink-0 items-center gap-2 border-r border-[var(--border-hairline)] px-5 text-sm font-semibold transition active:translate-y-px ${
                isActive
                  ? "border-b-2 border-b-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
              }`}
              href={tab.href}
              key={tab.key}
            >
              <span>{tab.label}</span>
              {typeof count === "number" ? (
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                    isActive ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-inset)] text-[var(--text-muted)]"
                  }`}
                >
                  {count.toLocaleString("en-US")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
