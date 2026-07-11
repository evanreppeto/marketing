// Tiny inline trend sparkline — a normalized SVG path from a raw number series.
// Pure SVG (no client hooks), so it renders fine inside server components. Shared
// by the home KPI row and the persona cards. Stroke reads green when the trend is
// up, gold otherwise; the wrapper scales it to its container width via CSS.
export function Sparkline({
  points,
  up,
  w = 84,
  h = 26,
}: {
  points: number[];
  up: boolean;
  w?: number;
  h?: number;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 5) - 2.5;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden preserveAspectRatio="none">
      <path
        d={d}
        stroke={up ? "var(--ok)" : "var(--accent)"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
