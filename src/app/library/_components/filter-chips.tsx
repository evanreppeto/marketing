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
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const on = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            aria-pressed={on}
            className={cx(
              "rounded-full border px-3 py-1 text-[11.5px] font-medium transition",
              on
                ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]",
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
