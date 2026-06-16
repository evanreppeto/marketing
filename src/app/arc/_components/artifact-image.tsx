"use client";

import { useState } from "react";
import Image from "next/image";

import { cx } from "@/app/_components/theme";
import type { ArcMedia } from "@/domain";

import { Lightbox } from "./lightbox";

/**
 * The visual half of a deliverable — Arc's concept image, shown as part of the
 * artifact rather than as a loose attachment. Click to zoom full-screen. `bare`
 * drops the outer frame so it sits flush inside a bordered card (the inline chat
 * draft card); the default framed variant is used standalone in the work canvas.
 */
export function ArtifactImage({ image, bare = false }: { image: ArcMedia; bare?: boolean }) {
  const [zoom, setZoom] = useState(false);
  const alt = image.alt ?? image.caption ?? "Concept visual";
  return (
    <figure
      className={cx(
        "m-0",
        bare
          ? "border-b border-[var(--border-hairline)]"
          : "overflow-hidden rounded-lg border border-[var(--border-hairline)]",
      )}
    >
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`Zoom ${alt}`}
        className="group relative block aspect-[16/10] w-full bg-[var(--media-void)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Image
          src={image.url}
          alt={alt}
          fill
          unoptimized
          sizes="(min-width:1280px) 24rem, 90vw"
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        {/* Zoom affordance on hover */}
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--overlay)] text-[var(--text-primary)] opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="5" /><path d="M13 13l4 4M7 9h4M9 7v4" />
          </svg>
        </span>
      </button>
      {image.caption ? (
        <figcaption className="px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary)]">
          {image.caption}
        </figcaption>
      ) : null}
      {zoom ? <Lightbox media={image} onClose={() => setZoom(false)} /> : null}
    </figure>
  );
}
