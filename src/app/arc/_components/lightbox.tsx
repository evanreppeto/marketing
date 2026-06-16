"use client";

import { useEffect } from "react";
import Image from "next/image";

import { useAgentName } from "@/app/_components/agent-name-context";
import type { ArcMedia } from "@/domain";

import { MediaProvenance } from "./asset-meta";

/**
 * Full-screen zoom for a single asset image — used to inspect a creative before
 * approving. Closes on Escape or backdrop click. Sits above the Studio drawer
 * (z-60 > z-50). Carries the caption + provenance so context isn't lost at size.
 */
export function Lightbox({ media, onClose }: { media: ArcMedia; onClose: () => void }) {
  const agentName = useAgentName();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={media.caption ?? media.alt ?? "Image preview"}
      onClick={onClose}
      className="lightbox-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-[oklch(0.08_0.02_250/0.86)] p-4 backdrop-blur-sm"
    >
      <figure className="lightbox-panel relative m-0 flex max-h-full max-w-5xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <Image
          src={media.url}
          alt={media.alt ?? media.caption ?? `Media from ${agentName}`}
          width={1600}
          height={1200}
          unoptimized
          sizes="90vw"
          className="h-auto max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-[var(--elev-raised)]"
        />
        {media.caption || media.source || media.format || (media.riskFlags && media.riskFlags.length > 0) ? (
          <figcaption className="mt-3 flex max-w-2xl flex-col items-center gap-2 text-center">
            {media.caption ? <span className="text-sm text-[var(--text-secondary)]">{media.caption}</span> : null}
            <MediaProvenance media={media} className="justify-center" />
          </figcaption>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--elev-panel)] transition hover:border-[var(--accent)]"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </figure>
    </div>
  );
}
