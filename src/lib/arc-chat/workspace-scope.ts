import type { ArcActionCard } from "@/domain";

import type { ArcMessage } from "./persistence";

export type ArcWorkspaceScope = "latest" | "conversation";

export function selectArcWorkspaceMessages(
  messages: ArcMessage[],
  scope: ArcWorkspaceScope,
) {
  const arcMessages = messages.filter((message) => message.role === "arc");
  return scope === "conversation" ? arcMessages : arcMessages.slice(-1);
}

function cardKey(card: ArcActionCard) {
  return card.approval?.assetId
    || [card.kind, card.channel, card.title].filter(Boolean).join(":").toLocaleLowerCase();
}

/** Collect the workspace's deliverables without repeating the same approval
 * asset across runs. When an asset appears again, its newest representation
 * wins and moves to the end of the conversation timeline. */
export function collectArcWorkspaceCards(
  messages: ArcMessage[],
  scope: ArcWorkspaceScope,
  fallback: ArcActionCard[] = [],
) {
  const selected = selectArcWorkspaceMessages(messages, scope);
  if (selected.length === 0) return fallback;

  const cards = new Map<string, ArcActionCard>();
  for (const message of selected) {
    for (const card of message.actions) {
      const key = cardKey(card);
      cards.delete(key);
      cards.set(key, card);
    }
  }
  return [...cards.values()];
}
