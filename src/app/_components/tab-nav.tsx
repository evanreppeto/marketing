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
        "module-rise grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)]",
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
              <span className="text-sm font-bold text-[var(--text-primary)]">{tab.label}</span>
              {tab.count !== undefined ? <span className={theme.control.tabBadge}>{tab.count}</span> : null}
            </span>
            {tab.detail ? (
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
