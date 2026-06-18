export type DonutSegment = { key: string; label: string; value: number; toneVar: "ok" | "warn" | "priority" | "muted" };

const SIZE = 200;
const CENTER = SIZE / 2;
const OUTER = 92;
const INNER = 64;
const GAP = 0.03; // radians of padding between segments

const TONE_VAR: Record<DonutSegment["toneVar"], string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  priority: "var(--priority)",
  muted: "var(--border-strong)",
};

function polar(angle: number, radius: number): [number, number] {
  // angle 0 = top (12 o'clock), clockwise
  const a = angle - Math.PI / 2;
  return [CENTER + radius * Math.cos(a), CENTER + radius * Math.sin(a)];
}

/** SVG path for one donut arc segment between two angles (radians, clockwise from top). */
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
 * Donut of approval states with a center headline (big % + caption). Pure inline SVG with
 * deterministic arc math — renders server-side and always paints (no recharts/ResponsiveContainer).
 * Draws a single calm muted ring when the total is 0.
 */
export function DonutSplit({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}) {
  const live = segments.filter((segment) => segment.value > 0);
  const total = live.reduce((sum, segment) => sum + segment.value, 0);

  // Empty state: one full muted ring so the shape is present without implying data.
  const useGap = live.length > 1;
  let cursor = 0;
  const arcs = total > 0
    ? live.map((segment) => {
        const sweep = (segment.value / total) * (Math.PI * 2);
        const start = cursor + (useGap ? GAP / 2 : 0);
        const end = cursor + sweep - (useGap ? GAP / 2 : 0);
        cursor += sweep;
        return { key: segment.key, color: TONE_VAR[segment.toneVar], d: arcPath(start, Math.max(end, start + 0.001)) };
      })
    : [];

  return (
    <div className="relative h-[200px] w-full">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Portfolio approval split">
        {total > 0 ? (
          arcs.map((arc) => <path key={arc.key} d={arc.d} fill={arc.color} />)
        ) : (
          // Full muted ring via two stacked circles (outer fill minus inner cutout).
          <>
            <circle cx={CENTER} cy={CENTER} r={(OUTER + INNER) / 2} fill="none" stroke="var(--border-hairline)" strokeWidth={OUTER - INNER} />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{centerValue}</div>
        <div className="mt-1 max-w-[10rem] text-center text-xs font-medium text-[var(--text-muted)]">{centerLabel}</div>
      </div>
    </div>
  );
}
