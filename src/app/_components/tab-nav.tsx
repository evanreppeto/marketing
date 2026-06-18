import Link from "next/link";

import { cx, theme } from "./theme";

export type TabItem = {
  key: string;
  label: string;
  detail?: string;
  count?: number;
  icon?: React.ReactNode;
  href: string;
};

/**
 * Canonical tabbed-section navigation. One source of truth for the card-tab
 * pattern that was previously copy-pasted across CRM, personas, reports, and
 * approvals. Styling comes entirely from `theme.control.tab*` tokens.
 *
 * `columns` must be a literal Tailwind grid-cols-* class string (e.g. "sm:grid-cols-2 xl:grid-cols-4") so Tailwind's JIT can see it.
 */
export function TabNav({
  ariaLabel,
  tabs,
  activeKey,
  columns,
  className = "",
}: {
  ariaLabel: string;
  tabs: TabItem[];
  activeKey: string;
  columns: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        theme.control.tabList,
        columns,
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              theme.control.tabBase,
              "flex-col items-start justify-center gap-1.5",
              active ? theme.control.tabActive : theme.control.tabIdle,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {tab.icon ? (
                <span
                  className={cx(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4",
                    active ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]",
                  )}
                >
                  {tab.icon}
                </span>
              ) : null}
              <span className="min-w-0 truncate text-sm font-bold text-current">{tab.label}</span>
              {tab.count !== undefined ? (
                <span className={cx(theme.control.tabBadge, active ? "text-[var(--accent)]" : "")}>{tab.count}</span>
              ) : null}
            </span>
            {tab.detail !== undefined ? (
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            ) : null}
            {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
