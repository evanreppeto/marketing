"use client";

export type FunnelStage = { label: string; count: number };

const NUM = new Intl.NumberFormat("en-US");

/** Horizontal funnel: each stage's bar width is proportional to the first (largest) stage. */
export function FunnelFlow({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0;
  return (
    <div className="space-y-3.5 p-4">
      {stages.map((stage, index) => {
        // Proportional to the top stage, with a readable floor so a steep
        // impressions→clicks drop doesn't collapse later stages to a sliver.
        const raw = top > 0 ? (stage.count / top) * 100 : 0;
        const pct = stage.count > 0 ? Math.max(raw, 14) : 0;
        const stepRate = index > 0 && stages[index - 1].count > 0 ? Math.round((stage.count / stages[index - 1].count) * 100) : null;
        const ofTop = top > 0 ? (stage.count / top) * 100 : 0;
        const ofTopLabel = ofTop >= 10 ? `${Math.round(ofTop)}%` : ofTop >= 1 ? `${ofTop.toFixed(1)}%` : `${ofTop.toFixed(2)}%`;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{stage.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {NUM.format(stage.count)}
                {stepRate !== null ? <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{stepRate}% of prior</span> : null}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{index === 0 ? "100%" : ofTopLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
