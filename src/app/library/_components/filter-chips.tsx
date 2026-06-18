"use client";

import { cx } from "@/app/_components/theme";

export type AssetFilter = "all" | "photos" | "video" | "arc" | "unused";

const FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "photos", label: "Photos" },
  { value: "video", label: "Video" },
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
    <div className="flex flex-wrap gap-1 border-b border-[var(--border-hairline)]">
      {FILTERS.map((f) => {
        const on = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            aria-pressed={on}
            className={cx(
              "relative rounded px-3 py-2 text-[11.5px] font-semibold transition active:translate-y-px",
              on
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {f.label}
            {on ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px rounded-full bg-[var(--accent)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}
