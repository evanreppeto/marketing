"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { ArcActionCard, ArcActionFlag, ArcMedia } from "@/domain";

import { ArtifactImage } from "./artifact-image";
import { DraftDecisionControls } from "./draft-decision-controls";
import { MediaProvenance, StatusPill } from "./asset-meta";
import { SaveStar } from "./save-star";

function flagClass(tone: ArcActionFlag["tone"]): string {
  if (tone === "ok") return "text-[var(--ok-text)] bg-[var(--ok-soft)]";
  if (tone === "warn") return "text-[var(--warn-text)] bg-[var(--warn-soft)]";
  return "text-[var(--priority-text)] bg-[var(--priority-soft)]";
}

function LockNote() {
  return (
    <span className="ml-auto flex items-center gap-1 self-center text-[11px] text-[var(--text-muted)]">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="9" width="10" height="7" rx="1.5" />
        <path d="M7 9V7a3 3 0 0 1 6 0v2" />
      </svg>
      outbound locked
    </span>
  );
}

export function ActionCard({
  card,
  sourceConversationId,
  sourceMessageId,
  image,
  onReview,
}: {
  card: ArcActionCard;
  sourceConversationId: string;
  sourceMessageId: string;
  /** Concept visual attached to the same reply — folded into the card. */
  image?: ArcMedia;
  /** Opens the full deliverable in the work canvas (draft cards only). */
  onReview?: () => void;
}) {
  const isDraft = card.kind === "draft";
  const media = image ?? card.media;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-inset)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-contrast)]" aria-hidden>
          {isDraft ? (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{card.title}</span>
        {card.status ? <StatusPill status={card.status} /> : null}
        {isDraft ? (
          <SaveStar
            input={{
              kind: "draft",
              title: card.title,
              body: card.preview ?? card.rows.map((r) => r.name).join("\n"),
              sourceCampaignId: card.approval?.campaignId,
              sourceAssetId: card.approval?.assetId,
              sourceConversationId,
              sourceMessageId,
            }}
            label="Save draft"
          />
        ) : null}
        {onReview ? (
          <button
            type="button"
            onClick={onReview}
            className="shrink-0 text-xs font-semibold text-[var(--accent-contrast)] transition hover:underline"
          >
            Review in Studio
          </button>
        ) : card.href ? (
          <Link href={card.href} className="shrink-0 text-xs font-semibold text-[var(--accent-contrast)] hover:underline">
            {isDraft ? "Open draft" : "View"}
          </Link>
        ) : null}
      </div>

      {media ? <ArtifactImage image={media} bare /> : null}
      {media ? <MediaProvenance media={media} className="border-b border-[var(--border-hairline)] px-3 py-2" /> : null}

      {card.preview ? (
        <p className="border-b border-[var(--border-hairline)] px-3 py-2.5 text-xs italic leading-relaxed text-[var(--text-secondary)]">
          {card.preview}
        </p>
      ) : null}

      {card.rows.length > 0 ? (
        <div className="flex flex-col">
          {card.rows.map((r, i) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{r.name}</span>
                {r.meta ? <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{r.meta}</span> : null}
                {r.badge ? <span className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--on-accent)]">{r.badge}</span> : null}
              </>
            );
            const rowCls = "flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-3 py-2 last:border-b-0";
            return r.href ? (
              <Link key={`${i}-${r.name}`} href={r.href} className={cx(rowCls, "transition hover:bg-[var(--surface-raised)]")}>{inner}</Link>
            ) : (
              <div key={`${i}-${r.name}`} className={rowCls}>{inner}</div>
            );
          })}
        </div>
      ) : null}

      {card.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
          {card.flags.map((f, i) => (
            <span key={`${i}-${f.label}`} className={cx("rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", flagClass(f.tone))}>
              {f.label}
            </span>
          ))}
        </div>
      ) : null}

      {isDraft && card.approval ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] px-3 py-2.5">
          <DraftDecisionControls campaignId={card.approval.campaignId} assetId={card.approval.assetId} />
          <LockNote />
        </div>
      ) : null}
    </div>
  );
}
