"use client";

import type { GalleryItem } from "@/lib/campaigns/gallery";

const STATUS_DOT: Record<GalleryItem["approvalStatus"], string> = {
  approved: "var(--success, #2f8f4e)",
  pending: "var(--warning, #c98a1b)",
  rejected: "var(--accent, #b3251f)",
  draft: "var(--text-secondary, #8a877f)",
};

export function MediaTile({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  const { media } = item;
  const isAi = item.sourceType === "ai";
  const thumb = media.thumbnailUrl ?? (media.type === "image" ? media.url : null);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="gallery-tile group relative block w-full overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-left"
      aria-label={`Open ${media.title}`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={media.title} className="block w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface)] text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {media.type}
        </div>
      )}

      <span
        className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        style={{ background: isAi ? "rgba(179,37,31,.92)" : "rgba(28,29,31,.82)" }}
      >
        {isAi ? "AI" : "Real"}
      </span>
      <span
        className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
        style={{ background: STATUS_DOT[item.approvalStatus] }}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white transition-transform duration-300 group-hover:translate-y-0">
        {media.title} · {item.campaignName}
      </span>
    </button>
  );
}
