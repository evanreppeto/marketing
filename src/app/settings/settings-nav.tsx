"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cx } from "../_components/theme";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";

/**
 * Apple-style settings rail: a searchable, icon-led list bucketed into labeled
 * groups. Navigation stays query-param based (`?section=`) so deep links and the
 * Overview cards keep working; search is local client state that filters the rail.
 */
export function SettingsNav({ active }: { active: SettingsSectionId }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const matches = SETTINGS_SECTIONS.filter((section) => {
      if (!q) return true;
      return (
        section.label.toLowerCase().includes(q) ||
        section.group.toLowerCase().includes(q) ||
        section.blurb.toLowerCase().includes(q) ||
        section.keywords.includes(q)
      );
    });
    return SETTINGS_GROUPS.map((name) => ({
      name,
      items: matches.filter((section) => section.group === name),
    })).filter((group) => group.items.length > 0);
  }, [q]);

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-0 lg:self-start">
      <div className="relative mb-4">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          aria-label="Search settings"
          className="min-h-10 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings"
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            onClick={() => setQuery("")}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="signal-eyebrow mb-2 px-3 text-[10px]">{group.name}</div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((section) => {
                const isActive = active === section.id;
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <Link
                      prefetch={false}
                      aria-current={isActive ? "page" : undefined}
                      className={cx(
                        "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        isActive
                          ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                      )}
                      href={`/settings?section=${section.id}`}
                    >
                      <Icon
                        aria-hidden
                        className={cx(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          isActive ? "text-[var(--accent-contrast)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]",
                        )}
                        strokeWidth={1.8}
                      />
                      <span className="truncate">{section.label}</span>
                      {isActive ? <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {groups.length === 0 ? (
          <p className="px-3 text-sm text-[var(--text-muted)]">No settings match &ldquo;{query}&rdquo;.</p>
        ) : null}
      </div>
    </nav>
  );
}
