/** Deterministic inline-SVG cost sparkline. No recharts (it crashes SSR here). */
export function CostSparkline({
  points,
  width = 520,
  height = 64,
}: {
  points: Array<{ date: string; costCents: number }>;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="h-16 w-full" aria-hidden="true" />;
  }

  const pad = 4;
  const max = Math.max(1, ...points.map((p) => p.costCents));
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (cents: number) => height - pad - (cents / max) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.costCents).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily AI cost trend"
    >
      <path d={area} fill="var(--accent)" opacity={0.08} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
