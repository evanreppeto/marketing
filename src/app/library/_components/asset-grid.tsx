import { type MediaAssetView } from "@/lib/media-library/types";

export function AssetGrid({ assets }: { assets: MediaAssetView[] }) {
  return (
    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((a) => (
        <figure key={a.id} className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="relative aspect-[4/3] bg-[var(--surface-inset)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- user media, external/public URL */}
            <img alt={a.fileName} src={a.url} className="h-full w-full object-cover" />
            <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{a.badge}</span>
            {a.usedInCount > 0 ? (
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-[var(--ok)]">Used in {a.usedInCount}</span>
            ) : null}
          </div>
          <figcaption className="px-2.5 py-2">
            <div className="truncate text-[12px] text-[var(--text-primary)]">{a.fileName}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{[a.dimensions, a.size].filter(Boolean).join(" · ")}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
