import type { ChartPoint } from "../campaign-analytics-model";
import { formatValue, type ValueFormat } from "./chart-kit";

const SIZE = 160;
const CENTER = SIZE / 2;
const OUTER = 72;
const INNER = 48;
const GAP = 0.03; // radians of padding between slices

// Gold-forward categorical ramp from theme tokens — calm, no neon.
const PALETTE = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--priority)", "var(--border-strong)"];

function polar(angle: number, radius: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [CENTER + radius * Math.cos(a), CENTER + radius * Math.sin(a)];
}

/** SVG path for one donut slice between two angles (radians, clockwise from top). */
function arcPath(start: number, end: number): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const [ox1, oy1] = polar(start, OUTER);
  const [ox2, oy2] = polar(end, OUTER);
  const [ix2, iy2] = polar(end, INNER);
  const [ix1, iy1] = polar(start, INNER);
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    `A ${INNER} ${INNER} 0 ${largeArc} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * Categorical donut + legend — pure inline SVG with deterministic arc math (no recharts).
 * Points arrive sorted desc; slices beyond the palette roll into one honest "Other" wedge
 * so every slice keeps a unique color. Renders identically on server and client.
 */
export function DonutPoints({ points, valueFormat }: { points: ChartPoint[]; valueFormat?: ValueFormat }) {
  const maxSlices = PALETTE.length;
  const sliced =
    points.length > maxSlices
      ? [
          ...points.slice(0, maxSlices - 1),
          { label: "Other", value: points.slice(maxSlices - 1).reduce((sum, point) => sum + point.value, 0), tone: "gray" as const },
        ]
      : points;

  const live = sliced.filter((point) => point.value > 0);
  const total = live.reduce((sum, point) => sum + point.value, 0);
  const useGap = live.length > 1;

  let cursor = 0;
  const arcs =
    total > 0
      ? live.map((point, index) => {
          const sweep = (point.value / total) * (Math.PI * 2);
          const start = cursor + (useGap ? GAP / 2 : 0);
          const end = cursor + sweep - (useGap ? GAP / 2 : 0);
          cursor += sweep;
          return { key: point.label, color: PALETTE[index % PALETTE.length], d: arcPath(start, Math.max(end, start + 0.001)) };
        })
      : [];

  return (
    <div className="flex items-center gap-5 p-4">
      <div className="h-[160px] w-[160px] shrink-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Breakdown by category">
          {total > 0 ? (
            arcs.map((arc) => <path key={arc.key} d={arc.d} fill={arc.color} />)
          ) : (
            <circle cx={CENTER} cy={CENTER} r={(OUTER + INNER) / 2} fill="none" stroke="var(--border-hairline)" strokeWidth={OUTER - INNER} />
          )}
        </svg>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {sliced.map((point, index) => (
          <li key={point.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: PALETTE[index % PALETTE.length] }} />
              <span className="truncate">{point.label}</span>
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{formatValue(point.value, valueFormat)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
