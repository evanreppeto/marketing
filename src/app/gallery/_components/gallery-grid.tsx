import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { GalleryCampaign } from "@/lib/gallery/aggregate";

export function GalleryGrid({ campaigns }: { campaigns: GalleryCampaign[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {campaigns.map((campaign) => (
        <GalleryCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

function GalleryCard({ campaign }: { campaign: GalleryCampaign }) {
  const { dispatch, metrics } = campaign;
  return (
    <Link
      href={campaign.href}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] transition hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex h-40 items-center justify-center overflow-hidden bg-[oklch(0.14_0.025_246)]">
        {campaign.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config
          <img src={campaign.thumbnailUrl} alt={campaign.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <span className="px-4 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {campaign.assetTypes.join(" · ") || "No creative cover"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-bold text-[var(--text-primary)]">{campaign.name}</h3>
          <StatusPill tone="blue">Live</StatusPill>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-secondary)]">
          <Stat label="Sent" value={dispatch.sent} />
          <Stat label="Delivered" value={dispatch.delivered} />
          {metrics.hasData ? <Stat label="Leads" value={metrics.leads} /> : null}
          {metrics.hasData ? <Stat label="Jobs" value={metrics.jobs} /> : null}
          {metrics.hasData && metrics.roi !== null ? <Stat label="ROI" value={`${metrics.roi.toFixed(1)}x`} /> : null}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{value}</span>
      {label}
    </span>
  );
}
