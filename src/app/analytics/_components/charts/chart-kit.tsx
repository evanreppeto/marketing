"use client";

import { useEffect, useState } from "react";

/** True when the user asked the OS to reduce motion; charts disable animation when so. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed from matchMedia after mount (browser-only); changes are handled by the listener below
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** How a chart value should be rendered. A serializable string (not a function) so it can
 *  cross the server→client boundary — Server Components cannot pass functions to Client ones. */
export type ValueFormat = "number" | "usd";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Render a numeric chart value per a serializable format descriptor. */
export function formatValue(value: number, format: ValueFormat = "number"): string {
  return format === "usd" ? USD.format(value) : String(value);
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

/** Themed tooltip for Recharts. `valueFormat` is a serializable descriptor (not a function). */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormat,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; payload?: { displayValue?: string } }>;
  label?: string;
  valueFormat?: ValueFormat;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  // Bar charts pass an axis `label`; pie/donut slices have no axis, so fall back to the slice name.
  const heading = label ?? point.name;
  const text = point.payload?.displayValue ?? formatValue(point.value, valueFormat);
  return (
    <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--elev-panel)]">
      {heading ? <div className="text-xs font-semibold text-[var(--text-primary)]">{heading}</div> : null}
      <div className="mt-0.5 font-mono text-sm font-bold text-[var(--accent)]">{text}</div>
    </div>
  );
}
