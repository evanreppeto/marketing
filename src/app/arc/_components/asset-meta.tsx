"use client";

import { cx } from "@/app/_components/theme";
import type { ArcActionCard, ArcAssetStatus, ArcMedia, ArcMediaSource } from "@/domain";

/** A human review decision on an asset (drives the optimistic preview loop). */
export type AssetDecision = "approved" | "declined" | "revision";

/** The risk reasons that gate approval — media risk flags + risk-tone card flags. */
export function riskReasons(card: ArcActionCard): string[] {
  const reasons = [
    ...(card.media?.riskFlags ?? []),
    ...card.flags.filter((f) => f.tone === "risk").map((f) => f.label),
  ];
  return Array.from(new Set(reasons));
}

/**
 * Small, reusable badges for asset provenance + review state — the visible
 * "evidence, approval state, media" the BSR charter asks every asset card to show.
 * No emojis; SVG + tokens only.
 */

const SOURCE_LABEL: Record<ArcMediaSource, string> = {
  bsr_real: "Real",
  ai_generated: "AI",
  composite: "Composite",
  stock: "Stock",
  external: "External",
};

const STATUS_LABEL: Record<ArcAssetStatus, string> = {
  draft: "Draft",
  revision: "Needs revision",
  approved: "Approved",
  rejected: "Rejected",
};

export function SourceBadge({ source }: { source: ArcMediaSource }) {
  const tone =
    source === "bsr_real"
      ? "text-[var(--ok-text)] bg-[var(--ok-soft)]"
      : source === "ai_generated"
        ? "text-[var(--accent-strong)] bg-[var(--accent-soft)]"
        : "text-[var(--text-secondary)] bg-[var(--surface-inset)]";
  return (
    <span className={cx("rounded px-1.5 py-0.5 text-[9px] font-medium", tone)}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function StatusPill({ status }: { status: ArcAssetStatus }) {
  const tone =
    status === "approved"
      ? "text-[var(--ok-text)] bg-[var(--ok-soft)]"
      : status === "rejected"
        ? "text-[var(--priority-text)] bg-[var(--priority-soft)]"
        : status === "revision"
          ? "text-[var(--warn-text)] bg-[var(--warn-soft)]"
          : "text-[var(--text-muted)] bg-[var(--surface-inset)]";
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[9px] font-medium", tone)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FormatChip({ format }: { format: string }) {
  return (
    <span className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[var(--text-muted)]">
      {format}
    </span>
  );
}

export function RiskFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1 rounded bg-[var(--priority-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--priority-text)]"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 7v4M10 14h.01M10 3l7 12H3z" />
          </svg>
          {f}
        </span>
      ))}
    </div>
  );
}

/** The provenance/format/risk strip for a media item, shown under a thumbnail or in detail. */
export function MediaProvenance({ media, className }: { media: ArcMedia; className?: string }) {
  const hasAny = media.source || media.format || (media.riskFlags && media.riskFlags.length > 0) || media.jobId || media.sourceId;
  if (!hasAny) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", className)}>
      {media.source ? <SourceBadge source={media.source} /> : null}
      {media.format ? <FormatChip format={media.format} /> : null}
      {media.sourceId ? (
        <span className="font-mono text-[9px] text-[var(--text-muted)]">#{media.sourceId}</span>
      ) : media.jobId ? (
        <span className="font-mono text-[9px] text-[var(--text-muted)]">{media.model ? `${media.model} · ` : ""}{media.jobId}</span>
      ) : null}
      {media.riskFlags && media.riskFlags.length > 0 ? <RiskFlags flags={media.riskFlags} /> : null}
    </div>
  );
}
