"use client";

import { useEffect } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { useDialogA11y } from "@/app/arc/_components/use-dialog-a11y";
import type { GalleryItem } from "@/lib/campaigns/gallery";

const STATUS_TONE = { approved: "green", pending: "amber", rejected: "red", draft: "gray" } as const;

export function MediaLightbox({ item, onClose }: { item: GalleryItem | null; onClose: () => void }) {
  // useDialogA11y handles focus-in, Tab trap, and focus-restore on close.
  // It does NOT handle Escape, so we keep the local Escape handler below.
  const dialogRef = useDialogA11y<HTMLDivElement>(!!item);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  const { media } = item;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={media.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-[88vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] md:grid-cols-[1.6fr_1fr]"
      >
        <div className="flex items-center justify-center bg-black/40 p-3">
          {media.type === "video" ? (
            <video src={media.url} controls className="max-h-[80vh] w-full rounded" />
          ) : media.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={media.title} className="max-h-[80vh] w-full rounded object-contain" />
          ) : (
            <div className="p-10 text-center text-sm text-[var(--text-secondary)]">Preview not available for this file type.</div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3 p-5">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">{media.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.campaignName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={item.sourceType === "ai" ? "red" : "gray"}>{item.sourceType === "ai" ? "AI generated" : "Real BSR media"}</StatusPill>
            <StatusPill tone={STATUS_TONE[item.approvalStatus]}>{item.approvalStatus}</StatusPill>
          </div>
          <dl className="mt-1 space-y-2 border-t border-[var(--border-hairline)] pt-3 text-sm">
            <Row k="Type" v={media.type} />
            <Row k="Asset" v={item.assetType} />
            {item.format ? <Row k="Format" v={item.format} /> : null}
            {item.usedInCount > 1 ? <Row k="Used in" v={`${item.usedInCount} campaigns`} /> : null}
            <Row k="Source" v={media.source} />
          </dl>
          <div className="mt-auto flex gap-2 pt-3">
            <Link
              href={`/campaigns/${item.campaignId}`}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Open campaign →
            </Link>
            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:text-[var(--text-primary)]"
            >
              View full size
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-secondary)]">{k}</dt>
      <dd className="truncate text-right font-medium text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}
