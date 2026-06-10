import type { MomentumCounts } from "./library-model";

/**
 * Slim lifecycle-momentum band above the queue. Built only from counts this read
 * model already has — engagement metrics (sent/opens) are a future addition and
 * are intentionally absent rather than faked.
 */
export function MomentumStrip({ counts }: { counts: MomentumCounts }) {
  const stats = [
    { label: "Live", value: counts.live },
    { label: "Ready", value: counts.ready },
    { label: "Drafts", value: counts.drafts },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-9 gap-y-3 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-soft)] px-5 py-3">
      {stats.map((stat) => (
        <div key={stat.label}>
          <div className="font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">{stat.value}</div>
          <div className="text-[10px] uppercase tracking-[0.09em] text-[var(--text-muted)]">{stat.label}</div>
        </div>
      ))}
      <div className="ml-auto text-right">
        <div className="font-mono text-lg font-semibold tabular-nums text-[var(--accent)]">{counts.awaiting}</div>
        <div className="text-[10px] uppercase tracking-[0.09em] text-[var(--text-muted)]">Awaiting you</div>
      </div>
    </div>
  );
}
