"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/app/_components/page-header";
import type { ChartPoint } from "../campaign-analytics-model";
import { ChartTooltip, NeedsDataChip, formatValue, useReducedMotion, type ValueFormat } from "./chart-kit";
import { useChartTheme, type ChartTheme } from "./use-chart-theme";

function toneColor(tone: ChartPoint["tone"], theme: ChartTheme): string {
  switch (tone) {
    case "green":
      return theme.ok;
    case "amber":
      return theme.warn;
    case "red":
      return theme.priority;
    default:
      return theme.accent;
  }
}

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
  const theme = useChartTheme();
  const reduced = useReducedMotion();

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

  // Each row ~44px keeps labels legible; min height avoids a squashed single-bar chart.
  const height = Math.max(points.length * 44, 120);
  const data = points.map((point) => ({
    ...point,
    displayValue: formatValue(point.value, valueFormat),
  }));

  return (
    <div className="p-4">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: theme.surface }} content={<ChartTooltip valueFormat={valueFormat} />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={!reduced} animationDuration={420}>
            {data.map((point) => (
              <Cell key={point.label} fill={toneColor(point.tone, theme)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
