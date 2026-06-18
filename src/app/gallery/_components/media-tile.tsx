"use client";

import { useRef, useState, type CSSProperties, type MouseEvent } from "react";

import type { GalleryItem } from "@/lib/campaigns/gallery";

const STATUS_DOT: Record<GalleryItem["approvalStatus"], string> = {
  approved: "var(--success, #2f8f4e)",
  pending: "var(--warning, #c98a1b)",
  rejected: "var(--accent, #b3251f)",
  draft: "var(--text-secondary, #8a877f)",
};

const MAX_TILT = 9; // degrees of rotation at the tile edges

const RESET_TILT: CSSProperties = { transform: "rotateX(0deg) rotateY(0deg) scale(1)" };

export function MediaTile({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  const { media } = item;
  const isAi = item.sourceType === "ai";
  const thumb = media.thumbnailUrl ?? (media.type === "image" ? media.url : null);

  const mediaRef = useRef<HTMLSpanElement>(null);
  const [tiltStyle, setTiltStyle] = useState<CSSProperties>(RESET_TILT);
  const [glareStyle, setGlareStyle] = useState<CSSProperties>({ opacity: 0 });

  function handleMove(event: MouseEvent<HTMLButtonElement>) {
    const el = mediaRef.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width; // 0..1 across
    const py = (event.clientY - rect.top) / rect.height; // 0..1 down
    const rotateY = (px - 0.5) * MAX_TILT * 2;
    const rotateX = (0.5 - py) * MAX_TILT * 2;

    setTiltStyle({
      transform: `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(1.04)`,
      transition: "transform 80ms ease-out",
    });
    setGlareStyle({
      opacity: 1,
      background: `radial-gradient(circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255,255,255,0.5), rgba(255,255,255,0) 55%)`,
    });
  }

  function handleLeave() {
    setTiltStyle(RESET_TILT);
    setGlareStyle({ opacity: 0 });
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="gallery-tile group relative block w-full text-left [perspective:700px]"
      aria-label={`Open ${media.title}`}
    >
      <span
        ref={mediaRef}
        style={tiltStyle}
        className="gallery-tile-media relative block overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] shadow-[0_2px_6px_rgba(0,0,0,0.12)] group-hover:shadow-[0_18px_30px_rgba(0,0,0,0.22)]"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={media.title} className="block w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-raised)] text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            {media.type}
          </div>
        )}

        <span aria-hidden="true" className="pointer-events-none absolute inset-0 transition-opacity duration-200" style={glareStyle} />

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
      </span>
    </button>
  );
}
