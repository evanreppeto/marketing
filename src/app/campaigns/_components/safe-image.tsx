"use client";

import { useState } from "react";

/**
 * Renders a remote creative image, collapsing to a neutral "unavailable" tile if
 * the URL fails to load. Campaign media can point at arbitrary remote URLs (real
 * library assets, generated creative); a dead link must degrade gracefully
 * instead of showing a broken-image icon or a misleading placeholder.
 */
export function SafeImage({
  src,
  alt,
  className,
  title,
}: {
  src: string;
  alt: string;
  className?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);

  // React reuses one SafeImage instance across re-renders (e.g. switching the
  // active asset in MediaReview), so a stale failure must clear when src changes
  // — otherwise a good image inherits the previous image's "unavailable" tile.
  // Reset during render (React's recommended pattern) rather than in an effect.
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setFailed(false);
  }

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-[var(--surface-inset)] text-center ${className ?? ""}`}
        title={title}
      >
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Image unavailable
        </span>
        <span className="px-3 text-[11px] leading-4 text-[var(--text-muted)]">
          The linked creative could not be loaded.
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote creative URLs; no optimizer config
    <img src={src} alt={alt} title={title} className={className} onError={() => setFailed(true)} />
  );
}
