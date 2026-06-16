import type { ArcActionCard, ArcMedia } from "@/domain";
import type { ArcMessage } from "@/lib/arc-chat/persistence";

export type StudioAsset = {
  id: string;
  card: ArcActionCard;
  /** Resolved visual: the card's own media, else the reply's first image. */
  media?: ArcMedia;
  conversationId: string;
  messageId: string;
};

/** Gather every asset Arc generated across the given messages — the Studio's
 *  library source. Dedupes by asset id; the FIRST occurrence wins, so callers
 *  that want current-chat assets to take precedence must list them first. */
export function collectAssets(messages: ArcMessage[]): StudioAsset[] {
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
