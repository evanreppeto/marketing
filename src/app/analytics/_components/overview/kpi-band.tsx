import Link from "next/link";

import type { KpiDelta } from "@/lib/performance/overview-shape";

export type Kpi = {
  label: string;
  value: string;
  delta?: KpiDelta | null;
  caption?: string;
  toneVar: "ok" | "warn" | "accent";
  href?: string;
};

const DOT: Record<Kpi["toneVar"], string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  accent: "bg-[var(--accent)]",
};

function DeltaTag({ delta }: { delta: KpiDelta | null | undefined }) {
  if (!delta) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  if (delta.dir === "flat") return <span className="text-xs text-[var(--text-muted)]">no change</span>;
  const up = delta.dir === "up";
  return (
    <span className={`text-xs font-semibold ${up ? "text-[var(--ok)]" : "text-[var(--priority)]"}`}>
      {up ? "▲" : "▼"} {delta.pct}%
    </span>
  );
}

export function KpiBand({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="module-rise mb-5 grid overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const body = (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[kpi.toneVar]}`} aria-hidden="true" />
              {kpi.label}
            </div>
            <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{kpi.value}</div>
            <div className="mt-1.5 flex items-center gap-2">
              {kpi.delta !== undefined ? <DeltaTag delta={kpi.delta} /> : null}
              {kpi.caption ? <span className="text-xs text-[var(--text-secondary)]">{kpi.caption}</span> : null}
            </div>
          </>
        );
        return kpi.href ? (
          <Link key={kpi.label} href={kpi.href} className="border-b border-r border-[var(--border-hairline)] p-4 transition-[background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-inset)]">{body}</Link>
        ) : (
          <div key={kpi.label} className="border-b border-r border-[var(--border-hairline)] p-4">{body}</div>
        );
      })}
    </section>
  );
}
