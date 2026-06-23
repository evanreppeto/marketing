import { ImageOff, PlayCircle } from "lucide-react";
import Link from "next/link";

import { type MediaAssetView } from "@/lib/media-library/types";

const VISUAL_KINDS = new Set(["image", "logo", "video"]);
const SHOWN = 11;

/**
 * Brand media strip — surfaces the real logos/photos from the Library asset
 * store so the brand page shows what {agentName} actually has to work with,
 * not just a link out. Renders nothing when there are no visual assets.
 */
export function BrandMedia({ assets }: { assets: MediaAssetView[] }) {
  const visual = assets.filter((asset) => VISUAL_KINDS.has(asset.kind));
  if (visual.length === 0) return null;

  const shown = visual.slice(0, SHOWN);
  const overflow = visual.length - shown.length;

  return (
    <section aria-labelledby="brand-media-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-media-heading">
            Brand media
          </h2>
          <span className="text-sm text-[var(--text-muted)]">{visual.length}</span>
        </div>
        <Link className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href="/library">
          Open in Library →
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {shown.map((asset) => (
          <MediaTile asset={asset} key={asset.id} />
        ))}
        {overflow > 0 ? (
          <Link
            className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            href="/library"
          >
            +{overflow}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MediaTile({ asset }: { asset: MediaAssetView }) {
  const isVideo = asset.kind === "video";
  return (
    <div
      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)]"
      title={asset.fileName}
    >
      {isVideo ? (
        <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
          <PlayCircle aria-hidden className="h-7 w-7" />
        </div>
      ) : asset.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={asset.fileName} className="h-full w-full object-cover" loading="lazy" src={asset.url} />
      ) : (
        <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
          <ImageOff aria-hidden className="h-6 w-6" />
        </div>
      )}
      {!asset.availableToArc ? (
        <span className="absolute inset-x-0 bottom-0 bg-[color-mix(in_srgb,var(--canvas)_82%,transparent)] px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Hidden
        </span>
      ) : null}
    </div>
  );
}
