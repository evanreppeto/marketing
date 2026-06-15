"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartTooltip, useReducedMotion } from "./chart-kit";
import { useChartTheme } from "./use-chart-theme";

export type DonutSegment = { key: string; label: string; value: number; toneVar: "ok" | "warn" | "priority" | "muted" };

/** Donut of approval states with a center headline (big % + caption). Renders a calm empty ring when total is 0. */
export function DonutSplit({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  const color = (toneVar: DonutSegment["toneVar"]) =>
    toneVar === "ok" ? theme.ok : toneVar === "warn" ? theme.warn : toneVar === "priority" ? theme.priority : theme.grid;

  // When empty, draw a single muted ring so the shape is present without implying data.
  const data = total > 0 ? segments.filter((segment) => segment.value > 0) : [{ key: "empty", label: "No pieces yet", value: 1, toneVar: "muted" as const }];

  return (
    <div className="relative h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={64}
            outerRadius={92}
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={!reduced}
            animationDuration={480}
          >
            {data.map((segment) => (
              <Cell key={segment.key} fill={color(segment.toneVar)} />
            ))}
          </Pie>
          {total > 0 ? <Tooltip content={<ChartTooltip />} /> : null}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{centerValue}</div>
        <div className="mt-1 max-w-[10rem] text-center text-xs font-medium text-[var(--text-muted)]">{centerLabel}</div>
      </div>
    </div>
  );
}
