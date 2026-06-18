import Link from "next/link";

import type { PerformanceAnomaly, PerformanceNextMove } from "@/lib/performance/read-model";
import { buttonClasses } from "@/app/_components/page-header";

const ANOMALY_TONE: Record<PerformanceAnomaly["tone"], { dot: string; chip: string }> = {
  ok: { dot: "bg-[var(--ok)]", chip: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]" },
  amber: { dot: "bg-[var(--warn)]", chip: "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]" },
  red: { dot: "bg-[var(--priority)]", chip: "border-[var(--priority-border-soft)] bg-[var(--priority-soft)] text-[var(--priority-text)]" },
};

/** Right rail: source-backed anomalies Arc flagged, plus approval-gated next moves. */
export function InsightsRail({ anomalies, nextMoves }: { anomalies: PerformanceAnomaly[]; nextMoves: PerformanceNextMove[] }) {
  return (
    <div className="space-y-5">
      <section className="signal-panel module-rise overflow-hidden">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="signal-eyebrow">Signals</div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Anomalies</h2>
        </div>
        <ul className="divide-y divide-[var(--border-hairline)]">
          {anomalies.map((a) => {
            const tone = ANOMALY_TONE[a.tone];
            return (
              <li key={a.id} className="px-5 py-4">
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">{a.title}</p>
                      {a.metric ? (
                        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${tone.chip}`}>{a.metric}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{a.detail}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="signal-panel module-rise overflow-hidden">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="signal-eyebrow">Arc recommends</div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Next moves</h2>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">Drafted by Arc. Nothing goes out until you approve it.</p>
        </div>
        <ul className="divide-y divide-[var(--border-hairline)]">
          {nextMoves.map((m) => (
            <li key={m.id} className="px-5 py-4">
              <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">{m.title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{m.detail}</p>
              <Link href={m.href} className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-3" })}>
                {m.cta}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
