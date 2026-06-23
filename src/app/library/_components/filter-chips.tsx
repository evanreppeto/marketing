"use client";

import { cx, theme } from "@/app/_components/theme";

export type AssetFilter = "all" | "photos" | "video" | "documents" | "arc" | "unused";

const FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "photos", label: "Photos" },
  { value: "video", label: "Video" },
  { value: "documents", label: "Documents" },
  { value: "arc", label: "Available to Arc" },
  { value: "unused", label: "Unused" },
];

/**
 * Client-side, in-memory filter chips. The AssetGrid owns the active filter
 * state and the actual filtering; this is the presentational chip row.
 */
export function FilterChips({
  active,
  onChange,
}: {
  active: AssetFilter;
  onChange: (filter: AssetFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3">
      {FILTERS.map((f) => {
        const on = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            aria-pressed={on}
            className={cx(
              "relative rounded-[8px] px-3 py-2 text-[11.5px] font-semibold transition active:translate-y-px",
              on
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {f.label}
            {on ? <span aria-hidden className={theme.control.tabMarker} /> : null}
          </button>
        );
      })}
    </div>
  );
}
