"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/lib/performance/overview-shape";
import { EmptyState } from "@/app/_components/page-header";
import { ChartTooltip, useReducedMotion } from "../charts/chart-kit";
import { useChartTheme } from "../charts/use-chart-theme";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"area" | "line">("area");

  const hasData = data.some((point) => point.leads > 0 || point.bookings > 0);
  if (!hasData) {
    return <div className="p-4"><EmptyState title="No trend yet" detail="Once leads and jobs have timestamps, the weekly trend appears here." /></div>;
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: theme.accent }} />New leads</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: theme.ok }} />Booked jobs</span>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-panel)]">
          {(["area", "line"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-3 py-1 text-xs font-semibold capitalize transition ${mode === value ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {mode === "area" ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="trend-leads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} /><stop offset="100%" stopColor={theme.accent} stopOpacity={0} /></linearGradient>
              <linearGradient id="trend-bookings" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.ok} stopOpacity={0.3} /><stop offset="100%" stopColor={theme.ok} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="leads" stroke={theme.accent} strokeWidth={2} fill="url(#trend-leads)" isAnimationActive={!reduced} />
            <Area type="monotone" dataKey="bookings" stroke={theme.ok} strokeWidth={2} fill="url(#trend-bookings)" isAnimationActive={!reduced} />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="leads" stroke={theme.accent} strokeWidth={2} dot={false} isAnimationActive={!reduced} />
            <Line type="monotone" dataKey="bookings" stroke={theme.ok} strokeWidth={2} dot={false} isAnimationActive={!reduced} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
