"use client";

import type { GalleryFilters } from "@/lib/campaigns/gallery";

const TYPE_OPTS: Array<[GalleryFilters["type"], string]> = [["all", "All"], ["images", "Images"], ["video", "Video"], ["docs", "Docs"]];
const PROV_OPTS: Array<[GalleryFilters["provenance"], string]> = [["all", "All sources"], ["real", "Real BSR"], ["ai", "AI"]];
const STATUS_OPTS: Array<[GalleryFilters["status"], string]> = [["all", "Any status"], ["approved", "Approved"], ["pending", "Pending"]];

export function GalleryFilterBar({
  filters,
  onChange,
  shownCount,
  totalCount,
}: {
  filters: GalleryFilters;
  onChange: (next: GalleryFilters) => void;
  shownCount: number;
  totalCount: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2">
      <Group value={filters.type} opts={TYPE_OPTS} onPick={(type) => onChange({ ...filters, type })} />
      <span className="mx-1 h-4 w-px bg-[var(--border-hairline)]" />
      <Group value={filters.provenance} opts={PROV_OPTS} onPick={(provenance) => onChange({ ...filters, provenance })} />
      <span className="mx-1 h-4 w-px bg-[var(--border-hairline)]" />
      <Group value={filters.status} opts={STATUS_OPTS} onPick={(status) => onChange({ ...filters, status })} />
      <span className="ml-auto pr-1 text-xs text-[var(--text-secondary)]">{shownCount} of {totalCount}</span>
    </div>
  );
}

function Group<T extends string>({ value, opts, onPick }: { value: T; opts: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {opts.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          aria-pressed={value === key}
          className={
            value === key
              ? "rounded-full bg-[var(--text-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--surface)]"
              : "rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
