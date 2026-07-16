import { getArcChatModel } from "@/lib/arc-chat/read-model";
import { getMentionables } from "@/lib/arc-chat/mention-search";
import { buildArcWaitingOpportunities } from "@/lib/arc-chat/waiting-opps";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceSummary } from "@/lib/workspace-summary/read-model";

import { ArcView } from "./_components/arc-view";
import "./arc.css";

export const metadata = { title: "Arc" };

export default async function ArcPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string; prompt?: string }>;
}) {
  const sp = await searchParams;
  // Deep-link support: `?prompt=` prefills the composer (e.g. the campaign
  // "Ask Arc to draft it" CTA). Capped so a crafted URL can't stuff the box.
  const initialDraft = typeof sp.prompt === "string" && sp.prompt.trim() ? sp.prompt.slice(0, 4000) : undefined;
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";

  const [chat, mentionGroups, summary] = await Promise.all([
    getArcChatModel(sp.c ?? null, { startBlank: Boolean(sp.new) }),
    getMentionables(),
    // Cheap here: getWorkspaceSummary is request-cached and the nav rail already
    // computes it, so this is a cache hit. Best-effort — no summary just hides the
    // launcher's "waiting on you" strip.
    ctx?.orgId ? getWorkspaceSummary(ctx.orgId).catch(() => null) : Promise.resolve(null),
  ]);

  // `live` = a real backend is present (conversations may still be empty on a
  // fresh workspace — the composer works either way). Only "unavailable" (no
  // Supabase, e.g. the local backend-less preview) falls back to the mock.
  const live = chat.status !== "unavailable";
  const waiting = summary
    ? {
        approvals: summary.approvals.length,
        opportunities: summary.opportunities.length,
        // Surface the top waiting opportunities as tappable nudges — the proactive
        // "draft the next iteration" prompts greet the operator on open.
        items: buildArcWaitingOpportunities(summary.opportunities),
      }
    : null;

  return (
    <ArcView
      brandName={brandName}
      live={live}
      threadGroups={chat.status === "live" ? chat.threadGroups : []}
      messages={chat.status === "live" ? chat.messages : []}
      activeConversationId={chat.status === "live" ? chat.activeConversationId : null}
      mentionGroups={mentionGroups}
      waiting={waiting}
      initialDraft={initialDraft}
    />
  );
}
