import { EmptyState } from "@/app/_components/page-header";
import type { ChartPoint } from "../campaign-analytics-model";
import { NeedsDataChip, formatValue, type ValueFormat } from "./chart-kit";

/** Bar fill per tone — gold-forward, calm, drawn straight from theme tokens. */
const TONE_FILL: Record<ChartPoint["tone"], string> = {
  green: "var(--ok)",
  amber: "var(--warn)",
  red: "var(--priority)",
  blue: "var(--accent)",
  gray: "var(--border-strong)",
};

/**
 * Horizontal breakdown bars — pure CSS/flex (no recharts, no ResponsiveContainer).
 * Renders deterministically server-side: a label, a tone-colored bar scaled to the
 * row max, and a mono tabular value. Matches the calm analytics design language.
 */
export function BarBreakdown({
  points,
  missing = [],
  emptyTitle,
  emptyDetail,
  valueFormat,
}: {
  points: ChartPoint[];
  missing?: string[];
  emptyTitle: string;
  emptyDetail: string;
  valueFormat?: ValueFormat;
}) {
  if (points.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={emptyTitle} detail={emptyDetail} />
        {missing.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((label) => (
              <NeedsDataChip key={label} label={label} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <div className="p-4">
      <ul className="space-y-2.5">
        {points.map((point) => {
          const pct = Math.max((point.value / max) * 100, point.value > 0 ? 3 : 0);
          return (
            <li key={point.label} className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate text-sm text-[var(--text-secondary)]" title={point.label}>
                {point.label}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <span
                  className="block h-full rounded-full transition-[width]"
                  style={{ width: `${pct}%`, background: TONE_FILL[point.tone] }}
                />
              </span>
              <span className="w-16 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                {formatValue(point.value, valueFormat)}
              </span>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {missing.map((label) => (
            <NeedsDataChip key={label} label={label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
