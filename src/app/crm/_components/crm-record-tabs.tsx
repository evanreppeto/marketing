import Link from "next/link";

import { theme } from "../../_components/theme";

export const RECORD_TABS = ["overview", "activity", "intelligence", "related"] as const;
export type RecordTabKey = (typeof RECORD_TABS)[number];

const TAB_LABELS: Record<RecordTabKey, string> = {
  overview: "Overview",
  activity: "Activity",
  intelligence: "Intelligence",
  related: "Related",
};

/** Resolve the active tab from a raw searchParam, defaulting to overview. */
export function normalizeRecordTab(value: string | undefined): RecordTabKey {
  return (RECORD_TABS as readonly string[]).includes(value ?? "")
    ? (value as RecordTabKey)
    : "overview";
}

/** URL-driven tab bar. basePath is the record's own path (e.g. /crm/leads/<id>). */
export function CrmRecordTabs({ activeTab, basePath }: { activeTab: RecordTabKey; basePath: string }) {
  return (
    <div className="flex flex-wrap gap-5 border-b border-[var(--border-hairline)]">
      {RECORD_TABS.map((tab) => {
        const isActive = tab === activeTab;
        const href = tab === "overview" ? basePath : `${basePath}?tab=${tab}`;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex min-h-9 items-center pb-2.5 text-sm font-medium transition ${
              isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            href={href}
            key={tab}
          >
            {TAB_LABELS[tab]}
            {isActive ? <span aria-hidden className={theme.control.tabMarker} /> : null}
          </Link>
        );
      })}
    </div>
  );
}
