"use client";

export type FunnelStage = { label: string; count: number };

/** Horizontal funnel: each stage's bar width is proportional to the first (largest) stage. */
export function FunnelFlow({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0;
  return (
    <div className="space-y-3 p-4">
      {stages.map((stage, index) => {
        const pct = top > 0 ? Math.max((stage.count / top) * 100, stage.count > 0 ? 6 : 0) : 0;
        const stepRate = index > 0 && stages[index - 1].count > 0 ? Math.round((stage.count / stages[index - 1].count) * 100) : null;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{stage.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {stage.count}
                {stepRate !== null ? <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{stepRate}% of prior</span> : null}
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
