// Server-safe chart helpers. No "use client" here: the breakdown charts now render as
// inline SVG/CSS server components, so they must import pure values (formatValue, ValueFormat)
// and a server-renderable chip — not client-only hooks.

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
