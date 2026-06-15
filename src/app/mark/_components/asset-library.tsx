"use client";

import { useMemo, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { cx } from "@/app/_components/theme";
import type { MarkActionCard, MarkMedia } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

import { SourceBadge, StatusPill } from "./asset-meta";
import { AssetThumb } from "./asset-thumb";

export type StudioAsset = {
  id: string;
  card: MarkActionCard;
  /** Resolved visual: the card's own media, else the reply's first image. */
  media?: MarkMedia;
  conversationId: string;
  messageId: string;
};

/** Gather every asset Mark generated in the thread — the Studio's library source. */
export function collectAssets(messages: MarkMessage[]): StudioAsset[] {
  const out: StudioAsset[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    m.actions.forEach((card, i) => {
      if (card.kind !== "draft" && !card.media) return;
      const id = card.approval?.assetId ?? `${m.id}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      const media = card.media ?? m.media.find((x) => x.kind === "image");
      out.push({ id, card, media, conversationId: m.conversationId, messageId: m.id });
    });
  }
  return out;
}

function category(card: MarkActionCard): string {
  const c = `${card.channel ?? ""} ${card.format ?? ""}`.toLowerCase();
  if (c.includes("email")) return "Email";
  if (c.includes("sms") || c.includes("text")) return "SMS";
  if (c.includes("meta") || c.includes("instagram") || c.includes("reel") || c.includes("ad")) return "Ads";
  if (c.includes("print") || c.includes("pdf")) return "Print";
  if (card.media) return "Media";
  return "Other";
}

function AssetTile({ asset, onSelect }: { asset: StudioAsset; onSelect: (id: string) => void }) {
  const { card, media } = asset;
  return (
    <button
      type="button"
      onClick={() => onSelect(asset.id)}
      className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-left transition hover:border-[var(--accent-border-strong)]"
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--media-void)]">
        <AssetThumb card={card} media={media} />
        {card.status ? <span className="absolute left-1 top-1"><StatusPill status={card.status} /></span> : null}
        {media?.source ? <span className="absolute right-1 top-1"><SourceBadge source={media.source} /></span> : null}
      </span>
      <span className="flex flex-col gap-0.5 px-2 py-1.5">
        <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]" title={card.title}>{card.title}</span>
        {card.channel ? <span className="truncate text-[10px] text-[var(--text-muted)]">{card.channel}</span> : null}
      </span>
    </button>
  );
}

export function AssetLibrary({ assets, onSelect }: { assets: StudioAsset[]; onSelect: (id: string) => void }) {
  const agentName = useAgentName();
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) set.add(category(a.card));
    return ["All", ...Array.from(set)];
  }, [assets]);
  const [filter, setFilter] = useState("All");

  const shown = filter === "All" ? assets : assets.filter((a) => category(a.card) === filter);

  if (assets.length === 0) {
    return (
      <p className="text-xs leading-5 text-[var(--text-muted)]">
        Assets {agentName} generates for this campaign collect here — review, filter, and approve them without leaving the chat.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={cx(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              filter === c
                ? "bg-[var(--accent-soft)] text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
                : "text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:text-[var(--text-primary)]",
            )}
          >
            {c}
            {c === "All" ? <span className="ml-1 text-[var(--text-muted)]">{assets.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {shown.map((a) => (
            <AssetTile key={a.id} asset={a} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
