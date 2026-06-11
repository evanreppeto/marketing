"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkMedia } from "@/domain";

import { SaveStar } from "./save-star";

/** Showcases the images/videos Mark attaches to a reply: a responsive gallery
 *  with a smooth fullscreen lightbox for images and inline players for video. */
export function MessageMedia({ media, conversationId, messageId }: { media: MarkMedia[]; conversationId: string; messageId: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const lightboxItem = activeIndex !== null ? media[activeIndex] : null;
  const lightboxOpen = lightboxItem?.kind === "image";

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveIndex(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  if (media.length === 0) return null;
  const single = media.length === 1;

  return (
    <div className="mt-3">
      <div
        className={cx(
          "grid gap-2",
          single ? "max-w-md" : "[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]",
        )}
      >
        {media.map((item, i) => (
          <figure
            key={`${item.url}:${i}`}
            className="media-rise m-0"
            style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
          >
            <div
              className={cx(
                "relative overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--media-void)]",
                single ? "aspect-video" : "aspect-[4/3]",
              )}
            >
              {item.kind === "video" ? (
                <video controls poster={item.poster} preload="metadata" className="h-full w-full object-cover">
                  <source src={item.url} />
                </video>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={item.alt ? `Open ${item.alt}` : "Open image"}
                  className="group block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <Image
                    src={item.url}
                    alt={item.alt ?? item.caption ?? "Media from Mark"}
                    fill
                    unoptimized
                    sizes={single ? "(min-width:1024px) 28rem, 90vw" : "(min-width:1024px) 16rem, 45vw"}
                    className="object-cover transition duration-300 ease-out group-hover:scale-[1.03]"
                  />
                </button>
              )}
              <span className="absolute right-1.5 top-1.5 rounded-md bg-[var(--overlay)] backdrop-blur-sm">
                <SaveStar
                  input={{
                    kind: "media",
                    mediaUrl: item.url,
                    caption: item.caption ?? undefined,
                    sourceConversationId: conversationId,
                    sourceMessageId: messageId,
                  }}
                  label="Save media"
                />
              </span>
            </div>
            {item.caption || item.href ? (
              <figcaption className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
                {item.caption ? (
                  <span className="truncate text-xs text-[var(--text-secondary)]">{item.caption}</span>
                ) : (
                  <span />
                )}
                {item.href ? (
                  <Link
                    href={item.href}
                    className="shrink-0 text-xs font-semibold text-[var(--accent)] transition hover:text-[var(--accent-contrast)]"
                  >
                    Open ▸
                  </Link>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>

      {lightboxOpen && lightboxItem ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.caption ?? "Image preview"}
          onClick={() => setActiveIndex(null)}
          className="lightbox-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.08_0.02_250/0.86)] p-4 backdrop-blur-sm"
        >
          <figure
            className="lightbox-panel relative m-0 flex max-h-full max-w-5xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={lightboxItem.url}
              alt={lightboxItem.alt ?? lightboxItem.caption ?? "Media from Mark"}
              width={1600}
              height={1200}
              unoptimized
              sizes="90vw"
              className="h-auto max-h-[82vh] w-auto max-w-full rounded-xl object-contain shadow-[var(--elev-raised)]"
            />
            {lightboxItem.caption ? (
              <figcaption className="mt-3 max-w-2xl text-center text-sm text-[var(--text-secondary)]">
                {lightboxItem.caption}
              </figcaption>
            ) : null}
            <button
              type="button"
              onClick={() => setActiveIndex(null)}
              aria-label="Close preview"
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--elev-panel)] transition hover:border-[var(--accent)]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </figure>
        </div>
      ) : null}
    </div>
  );
}
