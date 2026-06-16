"use client";

import { useState } from "react";

import type { ChartPoint } from "../campaign-analytics-model";
import { BarBreakdown } from "./bar-breakdown";
import { DonutPoints } from "./donut-points";
import { NeedsDataChip } from "./chart-kit";

/** A breakdown that the viewer can flip between a bar chart and a donut. Missing items stay honest chips. */
export function ToggleChart({
  points,
  missing = [],
  emptyTitle,
  emptyDetail,
  formatter,
  initial = "bars",
}: {
  points: ChartPoint[];
  missing?: string[];
  emptyTitle: string;
  emptyDetail: string;
  formatter?: (value: number) => string;
  initial?: "bars" | "donut";
}) {
  const [mode, setMode] = useState<"bars" | "donut">(initial);
  if (points.length === 0) {
    return <BarBreakdown points={points} missing={missing} emptyTitle={emptyTitle} emptyDetail={emptyDetail} formatter={formatter} />;
  }
  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-panel)]">
          {(["bars", "donut"] as const).map((value) => (
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
      {mode === "bars" ? (
        <BarBreakdown points={points} missing={[]} emptyTitle={emptyTitle} emptyDetail={emptyDetail} formatter={formatter} />
      ) : (
        <DonutPoints points={points} formatter={formatter} />
      )}
      {missing.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {missing.map((label) => (
            <NeedsDataChip key={label} label={label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
