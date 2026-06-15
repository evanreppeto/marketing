"use client";

export type BarSegment = { key: string; value: number; toneVar: "ok" | "warn" | "priority" | "idle" };

const TONE_CLASS: Record<BarSegment["toneVar"], string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  priority: "bg-[var(--priority)]",
  idle: "bg-[var(--border-strong)]",
};

/** Thin stacked bar (approved/waiting/changes/draft) for a campaign list row. Empty -> a single idle track. */
export function SegmentedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]" aria-hidden="true">
      {total > 0 ? (
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <div key={segment.key} className={TONE_CLASS[segment.toneVar]} style={{ width: `${(segment.value / total) * 100}%` }} />
          ))
      ) : null}
    </div>
  );
}
