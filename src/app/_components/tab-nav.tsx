import Link from "next/link";

import { cx, theme } from "./theme";

export type TabItem = {
  key: string;
  label: string;
  detail?: string;
  count?: number;
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
            className={cx(theme.control.tabBase, active ? theme.control.tabActive : theme.control.tabIdle)}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-current">{tab.label}</span>
              {tab.count !== undefined ? <span className={theme.control.tabBadge}>{tab.count}</span> : null}
            </span>
            {tab.detail !== undefined ? (
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            ) : null}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-0 h-px rounded-full bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] shadow-[0_0_14px_rgba(199,166,92,0.32)]"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
