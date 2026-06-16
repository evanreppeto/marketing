"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartPoint } from "../campaign-analytics-model";
import { ChartTooltip, formatValue, useReducedMotion, type ValueFormat } from "./chart-kit";
import { useChartTheme } from "./use-chart-theme";

// Gold-forward categorical ramp drawn from theme tokens — calm, no neon.
function palette(theme: ReturnType<typeof useChartTheme>): string[] {
  return [theme.accent, theme.ok, theme.warn, theme.priority, theme.textMuted];
}

export function DonutPoints({ points, valueFormat }: { points: ChartPoint[]; valueFormat?: ValueFormat }) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const colors = palette(theme);

  // The calm palette only has as many distinct colors as `colors.length`. Points arrive
  // sorted desc, so keep the top (colors.length - 1) and roll the rest into one honest
  // "Other" slice — every wedge gets a unique color instead of repeating.
  const maxSlices = colors.length;
  const sliced =
    points.length > maxSlices
      ? [
          ...points.slice(0, maxSlices - 1),
          { label: "Other", value: points.slice(maxSlices - 1).reduce((sum, point) => sum + point.value, 0), tone: "gray" as const },
        ]
      : points;
  const data = sliced.map((point) => ({ ...point, displayValue: formatValue(point.value, valueFormat) }));

  return (
    <div className="flex items-center gap-5 p-4">
      <div className="h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={!reduced}>
              {data.map((point, index) => (
                <Cell key={point.label} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((point, index) => (
          <li key={point.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors[index % colors.length] }} />
              <span className="truncate">{point.label}</span>
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{point.displayValue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
