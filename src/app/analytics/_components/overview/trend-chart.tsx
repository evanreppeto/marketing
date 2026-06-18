"use client";

import Switch from "@mui/material/Switch";
import { LineChart } from "@mui/x-charts/LineChart";
import { useMemo, useState } from "react";

import { EmptyState } from "@/app/_components/page-header";
import type { TrendPoint } from "@/lib/performance/overview-shape";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [showArea, setShowArea] = useState(true);
  const hasData = data.some((point) => point.leads > 0 || point.bookings > 0);

  const chartData = useMemo(
    () => ({
      bookings: data.map((point) => point.bookings),
      leads: data.map((point) => point.leads),
      weeks: data.map((point) => point.week),
    }),
    [data],
  );

  if (!hasData) {
    return (
      <div className="p-4">
        <EmptyState title="No trend yet" detail="Once leads and jobs have timestamps, the weekly trend appears here." />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />
            New leads
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--ok)]" />
            Booked jobs
          </span>
        </div>
        <label className="flex items-center gap-2 self-start rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-1 pl-3 pr-2 text-xs font-semibold text-[var(--text-secondary)] sm:self-auto">
          Area
          <Switch
            checked={showArea}
            onChange={(event) => setShowArea(event.target.checked)}
            size="small"
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": {
                color: "var(--accent)",
              },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                backgroundColor: "var(--accent)",
                opacity: 0.35,
              },
              "& .MuiSwitch-track": {
                backgroundColor: "var(--border-strong)",
              },
            }}
          />
        </label>
      </div>

      <LineChart
        axisHighlight={{ x: "line" }}
        grid={{ horizontal: true }}
        height={300}
        hideLegend
        margin={{ bottom: 34, left: 42, right: 18, top: 18 }}
        series={[
          {
            area: showArea,
            color: "var(--accent)",
            curve: "monotoneX",
            data: chartData.leads,
            id: "leads",
            label: "New leads",
            showMark: "end",
          },
          {
            area: showArea,
            color: "var(--ok)",
            curve: "monotoneX",
            data: chartData.bookings,
            id: "bookings",
            label: "Booked jobs",
            showMark: "end",
          },
        ]}
        skipAnimation={false}
        sx={{
          "& .MuiAreaElement-root": {
            fillOpacity: 0.12,
          },
          "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": {
            stroke: "var(--border-hairline)",
          },
          "& .MuiChartsAxis-tickLabel": {
            fill: "var(--text-muted)",
            fontFamily: "inherit",
            fontSize: 11,
          },
          "& .MuiChartsGrid-line": {
            stroke: "var(--border-hairline)",
          },
          "& .MuiLineElement-root": {
            strokeWidth: 2.4,
          },
          "& .MuiMarkElement-root": {
            stroke: "var(--surface-panel)",
            strokeWidth: 2,
          },
          fontFamily: "inherit",
        }}
        xAxis={[
          {
            data: chartData.weeks,
            scaleType: "point",
          },
        ]}
        yAxis={[
          {
            min: 0,
          },
        ]}
      />
    </div>
  );
}
