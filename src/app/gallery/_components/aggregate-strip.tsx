import { StatusPill } from "@/app/_components/page-header";
import type { GalleryTotals } from "@/lib/gallery/aggregate";

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function AggregateStrip({ totals }: { totals: GalleryTotals }) {
  const { dispatch, metrics } = totals;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Deployed", value: String(totals.campaigns) },
    { label: "Dispatched", value: String(dispatch.total) },
    { label: "Delivered", value: String(dispatch.delivered) },
  ];
  if (metrics.hasData) {
    stats.push(
      { label: "Impressions", value: metrics.impressions.toLocaleString("en-US") },
      { label: "Clicks", value: metrics.clicks.toLocaleString("en-US") },
      { label: "CTR", value: metrics.ctr !== null ? `${(metrics.ctr * 100).toFixed(1)}%` : "—" },
      { label: "Leads", value: String(metrics.leads) },
      { label: "Jobs", value: String(metrics.jobs) },
      { label: "Revenue", value: money(metrics.wonRevenueCents) },
      { label: "Spend", value: money(metrics.spendCents) },
      { label: "ROI", value: metrics.roi !== null ? `${metrics.roi.toFixed(1)}x` : "—" },
    );
  }

  return (
    <section className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Deployed performance</span>
        {!metrics.hasData ? <StatusPill tone="gray">Awaiting results data</StatusPill> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{stat.label}</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
