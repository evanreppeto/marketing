"use client";

import { useEffect, useState } from "react";

import type { GalleryItem } from "@/lib/campaigns/gallery";

export function SpotlightReel({ items, onOpen }: { items: GalleryItem[]; onOpen: (item: GalleryItem) => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % items.length), 4500);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[Math.min(active, items.length - 1)];
  const media = current.media;
  const bg = media.thumbnailUrl ?? media.url;

  return (
    <section className="gallery-hero-cycle relative mb-6 overflow-hidden rounded-xl border border-[var(--border-hairline)]" style={{ aspectRatio: "16 / 6" }}>
      <button type="button" onClick={() => onOpen(current)} className="block h-full w-full text-left">
        {media.type === "image" || media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt={media.title} className="h-full w-full object-cover transition-opacity duration-700" />
        ) : (
          <div className="h-full w-full bg-[var(--surface-inset)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Featured · approved</div>
          <div className="font-serif text-xl font-semibold">{media.title}</div>
          <div className="text-sm opacity-90">{current.campaignName}</div>
        </div>
      </button>
      {items.length > 1 ? (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.media.id}
              type="button"
              aria-label={`Show featured ${i + 1}`}
              onClick={() => setActive(i)}
              className="h-2 w-2 rounded-full"
              style={{ background: i === active ? "white" : "rgba(255,255,255,.45)" }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
