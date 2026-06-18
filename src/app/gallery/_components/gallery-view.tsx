"use client";

import { useMemo, useState } from "react";

import { filterGalleryItems, type GalleryFilters, type GalleryItem } from "@/lib/campaigns/gallery";
import { EmptyState } from "@/app/_components/page-header";

import { GalleryFilterBar } from "./gallery-filter-bar";
import { MediaLightbox } from "./media-lightbox";
import { MediaTile } from "./media-tile";
import { SpotlightReel } from "./spotlight-reel";

const DEFAULT_FILTERS: GalleryFilters = { type: "all", provenance: "all", status: "all" };

export function GalleryView({ items, hero }: { items: GalleryItem[]; hero: GalleryItem[] }) {
  const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<GalleryItem | null>(null);

  const shown = useMemo(() => filterGalleryItems(items, filters), [items, filters]);

  return (
    <div>
      <SpotlightReel items={hero} onOpen={setOpen} />
      <GalleryFilterBar filters={filters} onChange={setFilters} shownCount={shown.length} totalCount={items.length} />

      {shown.length === 0 ? (
        <EmptyState title="No media matches these filters" detail="Try widening the type, source, or status filters." />
      ) : (
        <div className="gallery-masonry">
          {shown.map((item) => (
            <MediaTile key={`${item.campaignId}-${item.media.id}`} item={item} onOpen={setOpen} />
          ))}
        </div>
      )}

      <MediaLightbox item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
