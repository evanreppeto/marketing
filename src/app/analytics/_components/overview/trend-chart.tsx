"use client";

import { useState } from "react";

import type { TrendPoint } from "@/lib/performance/overview-shape";
import { EmptyState } from "@/app/_components/page-header";

// Fixed drawing surface. The SVG scales responsively via viewBox + width:100%, so there is
// no ResponsiveContainer / measured-height dependency — it paints deterministically, server-side.
const VB_W = 720;
const VB_H = 240;
const PAD = { top: 14, right: 16, bottom: 26, left: 38 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

type SeriesKey = "leads" | "bookings";

/** Round a number up to a "nice" axis ceiling (10/20/25/50/100 step family). */
function niceCeil(value: number): number {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Performance-over-time chart: new leads vs. booked jobs across the range.
 * Pure inline-SVG with deterministic path math — gold (leads) + green (booked), soft area
 * fills, faint gridlines, small axis labels. Renders identical output on server and client.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [mode, setMode] = useState<"area" | "line">("area");

  const hasData = data.some((point) => point.leads > 0 || point.bookings > 0);
  if (!hasData) {
    return <div className="p-4"><EmptyState title="No trend yet" detail="Once leads and jobs have timestamps, the weekly trend appears here." /></div>;
  }

  const maxValue = Math.max(1, ...data.map((p) => Math.max(p.leads, p.bookings)));
  const yMax = niceCeil(maxValue);
  const n = data.length;

  const xAt = (i: number) => PAD.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) => PAD.top + PLOT_H - (v / yMax) * PLOT_H;

  // Horizontal gridlines + y-axis ticks (4 divisions).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  const linePath = (key: SeriesKey) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p[key]).toFixed(2)}`).join(" ");

  const areaPath = (key: SeriesKey) => {
    const base = PAD.top + PLOT_H;
    const top = data.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p[key]).toFixed(2)}`).join(" ");
    return `${top} L ${xAt(n - 1).toFixed(2)} ${base.toFixed(2)} L ${xAt(0).toFixed(2)} ${base.toFixed(2)} Z`;
  };

  // Show ~6 x labels max so they don't crowd at small widths.
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />New leads</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--ok)]" />Booked jobs</span>
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-0.5">
          {(["area", "line"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-[6px] px-3 py-1 text-xs font-semibold capitalize transition-[transform,background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${mode === value ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-secondary)]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" preserveAspectRatio="xMidYMid meet" className="h-auto w-full" role="img" aria-label="New leads versus booked jobs over time">
        <defs>
          <linearGradient id="trend-fill-leads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trend-fill-bookings" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0" />
          </linearGradient>
          {/* Clip every fill/line to the plot box so nothing bleeds into the axis gutters. */}
          <clipPath id="trend-plot">
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* Gridlines + y labels */}
        {ticks.map((t) => {
          const y = yAt(t);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke="var(--border-hairline)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular-nums">{t}</text>
            </g>
          );
        })}

        {/* Plotted geometry — clipped so fills/lines never spill past the axes. */}
        <g clipPath="url(#trend-plot)">
          {/* Area fills (area mode only). Booked drawn first so the gold leads area
              reads on top without muddying the green underneath. */}
          {mode === "area" ? (
            <>
              <path d={areaPath("bookings")} fill="url(#trend-fill-bookings)" />
              <path d={areaPath("leads")} fill="url(#trend-fill-leads)" />
            </>
          ) : null}

          {/* Series lines — drawn after fills so they sit on top */}
          <path d={linePath("bookings")} fill="none" stroke="var(--ok)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={linePath("leads")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>

        {/* x labels — below the plot, with a small inset on the ends so the first/last don't clip */}
        {data.map((p, i) => {
          if (!(i % labelEvery === 0 || i === n - 1)) return null;
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          const x = i === 0 ? PAD.left : i === n - 1 ? VB_W - PAD.right : xAt(i);
          return (
            <text key={`x-${i}`} x={x} y={VB_H - 8} textAnchor={anchor} fontSize={11} fill="var(--text-muted)" className="tabular-nums">{p.week}</text>
          );
        })}

        {/* End-point dots for the latest value of each series — outside the clip so the halo isn't cut */}
        <circle cx={xAt(n - 1)} cy={yAt(data[n - 1].bookings)} r={3} fill="var(--ok)" stroke="var(--surface-panel)" strokeWidth={1.5} />
        <circle cx={xAt(n - 1)} cy={yAt(data[n - 1].leads)} r={3} fill="var(--accent)" stroke="var(--surface-panel)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
