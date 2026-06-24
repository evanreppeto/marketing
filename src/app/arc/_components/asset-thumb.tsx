"use client";

import Image from "next/image";

import { cx } from "@/app/_components/theme";
import type { ArcActionCard, ArcMedia } from "@/domain";

/**
 * The visual that fills an asset's thumbnail box. With media → the image. Without
 * (email / SMS / doc copy), a channel-appropriate *content preview* so text assets
 * read as real creative instead of a blank tile. Fills its (relative) parent.
 */
export function AssetThumb({ card, media, eager = false }: { card: ArcActionCard; media?: ArcMedia; eager?: boolean }) {
  if (media) {
    return (
      <Image
        src={media.url}
        alt={media.alt ?? card.title}
        fill
        unoptimized
        loading={eager ? "eager" : "lazy"}
        sizes="16rem"
        className="object-cover transition duration-300 group-hover:scale-[1.03]"
      />
    );
  }

  const c = `${card.channel ?? ""} ${card.format ?? ""}`.toLowerCase();
  const subject = card.rows.find((r) => /subject/i.test(r.name))?.meta;
  const body = card.preview ?? "";

  if (c.includes("email")) {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 bg-[var(--surface-soft)] p-3">
        <div className="flex items-center gap-1.5">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--accent-soft)] text-[7px] font-bold text-[var(--accent-strong)]">YB</span>
          <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Your brand</span>
        </div>
        {subject ? <p className="line-clamp-1 text-[11px] font-semibold text-[var(--text-primary)]">{subject}</p> : null}
        <p className="line-clamp-4 text-[10px] leading-relaxed text-[var(--text-muted)]">{body}</p>
      </div>
    );
  }

  if (c.includes("sms") || c.includes("text")) {
    return (
      <div className="flex h-full w-full flex-col justify-end gap-1 bg-[var(--canvas-deep)] p-3">
        <span className="text-center text-[8px] font-medium text-[var(--text-muted)]">SMS</span>
        <div className="max-w-[90%] self-start rounded-2xl rounded-bl-md bg-[var(--surface-raised)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
          <p className="line-clamp-4 text-[10px] leading-relaxed text-[var(--text-primary)]">{body}</p>
        </div>
      </div>
    );
  }

  if (c.includes("print") || c.includes("pdf")) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--surface-soft)] p-3">
        <div className="flex h-full max-h-full w-[62%] flex-col gap-1 rounded-sm bg-[var(--surface-panel)] p-2 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
          <span className="mb-0.5 h-1.5 w-2/3 rounded-full bg-[var(--accent-soft)]" />
          {[88, 100, 70, 94, 60].map((w, i) => (
            <span key={i} className="h-1 rounded-full bg-[var(--border-strong)]" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  // Generic copy asset — faded lines.
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 bg-[var(--surface-soft)] p-4">
      {[90, 100, 75].map((w, i) => (
        <span key={i} className="h-1.5 rounded-full bg-[var(--border-strong)]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** A short copy snippet for filling sparse card bodies. */
export function CopySnippet({ card, className }: { card: ArcActionCard; className?: string }) {
  if (!card.preview) return null;
  return <p className={cx("line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]", className)}>{card.preview}</p>;
}
