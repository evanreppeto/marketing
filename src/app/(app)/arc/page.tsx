import { getArcChatModel } from "@/lib/arc-chat/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { ArcView } from "./_components/arc-view";
import "./arc.css";

export const metadata = { title: "Arc" };

export default async function ArcPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";

  const chat = await getArcChatModel(sp.c ?? null, { startBlank: Boolean(sp.new) });

  // `live` = a real backend is present (conversations may still be empty on a
  // fresh workspace — the composer works either way). Only "unavailable" (no
  // Supabase, e.g. the local backend-less preview) falls back to the mock.
  const live = chat.status !== "unavailable";

  return (
    <ArcView
      brandName={brandName}
      live={live}
      threadGroups={chat.status === "live" ? chat.threadGroups : []}
      messages={chat.status === "live" ? chat.messages : []}
      activeConversationId={chat.status === "live" ? chat.activeConversationId : null}
    />
  );
}
