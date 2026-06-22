"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { EmptyState } from "@/app/_components/page-header";
import type { TrendPoint } from "@/lib/performance/overview-shape";

const ClientLineChart = dynamic(() => import("@mui/x-charts/LineChart").then((module) => module.LineChart), {
  loading: ChartPlaceholder,
  ssr: false,
});

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
        <label className="flex items-center gap-2 self-start rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-1 pl-3 pr-2 text-xs font-semibold text-[var(--text-secondary)] sm:self-auto">
          Area
          <input
            type="checkbox"
            checked={showArea}
            onChange={(event) => setShowArea(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-4 w-8 rounded-full border border-[var(--border-hairline)] bg-[var(--border-strong)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.34)] transition peer-checked:border-[var(--accent-border-strong)] peer-checked:bg-[color-mix(in_srgb,var(--accent)_64%,var(--surface-inset))] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] before:absolute before:left-0.5 before:top-1/2 before:h-3 before:w-3 before:-translate-y-1/2 before:rounded-full before:bg-[var(--text-primary)] before:shadow-[0_2px_6px_rgba(0,0,0,0.34)] before:transition before:content-[''] peer-checked:before:translate-x-4 peer-checked:before:bg-[var(--accent)]"
          />
        </label>
      </div>

      <ClientLineChart
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
            fill: "var(--text-primary)",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.92,
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

function ChartPlaceholder() {
  return <div className="h-[300px] rounded-[8px] border border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-inset)_72%,transparent),transparent)]" />;
}
