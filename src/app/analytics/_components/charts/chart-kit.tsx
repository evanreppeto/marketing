"use client";

import { useEffect, useState } from "react";

/** True when the user asked the OS to reduce motion; charts disable animation when so. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** A small muted chip stating a metric has no data yet — keeps the page honest without a fake chart. */
export function NeedsDataChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" aria-hidden="true" />
      {label} — needs data
    </span>
  );
}

/** Themed tooltip for Recharts. `formatter` lets callers render dollars vs counts. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { displayValue?: string } }>;
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const text = point.payload?.displayValue ?? (formatter ? formatter(point.value) : String(point.value));
  return (
    <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--elev-panel)]">
      <div className="text-xs font-semibold text-[var(--text-primary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold text-[var(--accent)]">{text}</div>
    </div>
  );
}
