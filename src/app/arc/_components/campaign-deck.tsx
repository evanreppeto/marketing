"use client";

import { useRef } from "react";

import { cx } from "@/app/_components/theme";
import type { ArcActionCard } from "@/domain";

import { decideCampaignDraftAction } from "../actions";
import { MediaProvenance, StatusPill, riskReasons, type AssetDecision } from "./asset-meta";
import { AssetThumb, CopySnippet } from "./asset-thumb";

/** Channel glyph for text assets (no thumbnail) and as an overlay hint. */
function ChannelGlyph({ channel, className }: { channel?: string; className?: string }) {
  const c = (channel ?? "").toLowerCase();
  const common = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  if (c.includes("email")) return <svg {...common}><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M3.5 6l6.5 5 6.5-5" /></svg>;
  if (c.includes("sms") || c.includes("text")) return <svg {...common}><path d="M4 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-4 3V6a1 1 0 0 1 1-1z" /></svg>;
  if (c.includes("print") || c.includes("pdf")) return <svg {...common}><path d="M6 3h6l3 3v11H6z" /><path d="M12 3v3h3" /></svg>;
  if (c.includes("reel") || c.includes("video")) return <svg {...common}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M9 8l4 2-4 2z" /></svg>;
  return <svg {...common}><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="M4 14l4-3 3 2 3-3 2 2" /></svg>;
}

function DeckCard({
  card,
  assetIndex,
  onOpen,
  onDecision,
}: {
  card: ArcActionCard;
  assetIndex: number;
  onOpen?: (assetId: string) => void;
  onDecision?: (assetId: string, decision: AssetDecision) => void;
}) {
  const approval = card.approval;
  const assetId = approval?.assetId ?? `asset-${assetIndex}`;
  const approved = card.status === "approved";
  const rejected = card.status === "rejected";
  const revision = card.status === "revision";
  const decided = approved || rejected || revision;
  const hasRisk = riskReasons(card).length > 0;
  return (
    <div className="flex w-[15.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-inset)]">
      {/* Thumbnail or channel placeholder */}
      <button
        type="button"
        onClick={() => onOpen?.(assetId)}
        aria-label={`Open ${card.title} in Studio`}
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-[var(--media-void)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <AssetThumb card={card} media={card.media} eager={assetIndex === 0} />
        {card.status ? (
          <span className="absolute left-1.5 top-1.5">
            <StatusPill status={card.status} />
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5">
        <p className="truncate text-[13px] font-bold text-[var(--text-primary)]" title={card.title}>{card.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {card.channel ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <ChannelGlyph channel={card.channel} className="h-3 w-3" />
              {card.channel}
            </span>
          ) : null}
        </div>
        {card.media ? <MediaProvenance media={card.media} className="mt-0.5" /> : <CopySnippet card={card} className="mt-0.5" />}

        <div className="mt-auto flex items-center gap-1.5 pt-1.5">
          {decided ? (
            <>
              <span
                className={cx(
                  "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold",
                  approved ? "bg-[var(--ok-soft)] text-[var(--ok-text)]" : revision ? "bg-[var(--warn-soft)] text-[var(--warn-text)]" : "bg-[var(--surface-inset)] text-[var(--text-muted)]",
                )}
              >
                {approved ? (
                  <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                ) : null}
                {approved ? "Approved" : revision ? "Needs revision" : "Declined"}
              </span>
              <button type="button" onClick={() => onOpen?.(assetId)} className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
                Open ▸
              </button>
            </>
          ) : hasRisk ? (
            // Flagged assets can't be one-click approved — they must be reviewed in the Studio.
            <button
              type="button"
              onClick={() => onOpen?.(assetId)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--priority-soft)] py-1.5 text-[11px] font-bold text-[var(--priority-text)] transition hover:bg-[var(--priority-soft)]"
            >
              <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 7v4M10 14h.01M10 3l7 12H3z" /></svg>
              Review risk ▸
            </button>
          ) : approval ? (
            <>
              {onDecision ? (
                <button
                  type="button"
                  onClick={() => onDecision(approval.assetId, "approved")}
                  className="flex-1 rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] py-1.5 text-[11px] font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]"
                >
                  Approve
                </button>
              ) : (
                <form action={decideCampaignDraftAction} className="flex-1">
                  <input type="hidden" name="assetId" value={approval.assetId} />
                  <input type="hidden" name="campaignId" value={approval.campaignId} />
                  <input type="hidden" name="decision" value="approved" />
                  <button type="submit" className="w-full rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] py-1.5 text-[11px] font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]">
                    Approve
                  </button>
                </form>
              )}
              <button type="button" onClick={() => onOpen?.(assetId)} className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
                Open ▸
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onOpen?.(assetId)} className="flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
              Open ▸
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A whole campaign package rendered in the chat as a horizontal, scroll-snap deck
 * of asset cards. Used when a Arc reply carries 2+ draft cards. Outbound locked.
 */
export function CampaignDeck({
  cards,
  campaignName,
  onOpenAsset,
  onDecision,
}: {
  cards: ArcActionCard[];
  campaignName?: string;
  onOpenAsset?: (assetId: string) => void;
  onDecision?: (assetId: string, decision: AssetDecision) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pending = cards.filter((c) => c.status !== "approved" && c.status !== "rejected").length;

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 272, behavior: "smooth" });
  }

  return (
    <section className="mt-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" aria-label="Campaign package">
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 8h14M8 4v12" />
        </svg>
        <span className="text-[13px] font-bold text-[var(--text-primary)]">{campaignName ?? "Campaign package"}</span>
        <span className="text-[12px] text-[var(--text-muted)]">
          · {cards.length} assets{pending > 0 ? ` · ${pending} need approval` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Scroll left" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l-5 5 5 5" /></svg>
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Scroll right" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5l5 5-5 5" /></svg>
          </button>
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {cards.map((card, i) => (
          <DeckCard key={`${i}-${card.title}`} card={card} assetIndex={i} onOpen={onOpenAsset} onDecision={onDecision} />
        ))}
      </div>
    </section>
  );
}
