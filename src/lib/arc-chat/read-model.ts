import "server-only";

import { getOperatorActor } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import {
  listConversationsForViewer,
  listMessages,
  type ArcConversation,
  type ArcMessage,
} from "./persistence";
import { getShareViewer } from "./sharing";

/**
 * Page-facing read-model for the `/arc` chat screen. Resolves the current
 * viewer + operator, lists the conversations they may see, and loads the active
 * conversation's messages. Mirrors the vault/campaigns shape: a status union so
 * the UI can degrade gracefully.
 *
 * - "live"        — real conversations exist; render them.
 * - "empty"       — backend is configured but the workspace has no Arc chats yet
 *                   (fresh workspace) → the UI shows its illustrative mock.
 * - "unavailable" — no Supabase backend (local demo preview) or a read error →
 *                   the UI shows its illustrative mock.
 */
export type ArcChatModel =
  | {
      status: "live";
      operator: string;
      conversations: ArcConversation[];
      /** null when starting a brand-new chat (rail stays, composer opens blank). */
      activeConversationId: string | null;
      messages: ArcMessage[];
      /** Rail sections, grouped server-side (keeps the impure `now` read out of the page component). */
      threadGroups: ArcThreadGroupVM[];
    }
  | { status: "empty"; operator: string }
  | { status: "unavailable" };

export async function getArcChatModel(
  requestedConversationId?: string | null,
  opts?: { startBlank?: boolean },
): Promise<ArcChatModel> {
  if (!isSupabaseAdminConfigured()) return { status: "unavailable" };

  try {
    const [viewer, operator] = await Promise.all([getShareViewer(), getOperatorActor()]);
    const conversations = await listConversationsForViewer(viewer, operator);
    if (conversations.length === 0) return { status: "empty", operator };

    const nowMs = Date.now();

    // "New chat": keep the rail (real threads) but open a blank composer. The
    // first send creates the conversation.
    if (opts?.startBlank) {
      return {
        status: "live",
        operator,
        conversations,
        activeConversationId: null,
        messages: [],
        threadGroups: groupThreadsForRail(conversations, null, nowMs),
      };
    }

    // Honor the requested conversation only if it's one the viewer may see;
    // otherwise fall back to the most recent (listConversationsForViewer returns
    // pinned-first, then last_message_at desc).
    const active =
      (requestedConversationId
        ? conversations.find((c) => c.id === requestedConversationId)
        : undefined) ?? conversations[0];

    const messages = await listMessages(active.id);
    return {
      status: "live",
      operator,
      conversations,
      activeConversationId: active.id,
      messages,
      threadGroups: groupThreadsForRail(conversations, active.id, nowMs),
    };
  } catch {
    return { status: "unavailable" };
  }
}

/** One thread as the rail renders it. `pinned`/`active` drive the visual state. */
export type ArcThreadVM = {
  id: string;
  title: string;
  pinned: boolean;
  active: boolean;
  /** Short relative-time label (e.g. "2h", "Jun 24") for the row's meta line. */
  when: string;
};

export type ArcThreadGroupVM = { group: string; items: ArcThreadVM[] };

const DAY_MS = 86_400_000;

/** Short, stable relative-time label. `nowMs` is passed in so callers stay pure. */
function relativeWhen(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, nowMs - then);
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function bucket(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Earlier";
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  if (then >= todayMs) return "Today";
  if (then >= todayMs - DAY_MS) return "Yesterday";
  if (then >= todayMs - 7 * DAY_MS) return "Previous 7 days";
  return "Earlier";
}

const GROUP_ORDER = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Earlier"];

/**
 * Group conversations into the rail's sections (Pinned / Today / Yesterday /
 * Previous 7 days / Earlier). Pure: pass `nowMs` from the caller so the server
 * component controls "now" and there's no hidden clock read.
 */
export function groupThreadsForRail(
  conversations: ArcConversation[],
  activeConversationId: string | null,
  nowMs: number,
): ArcThreadGroupVM[] {
  const groups = new Map<string, ArcThreadVM[]>();
  for (const c of conversations) {
    const group = c.pinnedAt ? "Pinned" : bucket(c.lastMessageAt, nowMs);
    const item: ArcThreadVM = {
      id: c.id,
      title: c.title?.trim() || "Untitled chat",
      pinned: Boolean(c.pinnedAt),
      active: c.id === activeConversationId,
      when: relativeWhen(c.lastMessageAt, nowMs),
    };
    const list = groups.get(group);
    if (list) list.push(item);
    else groups.set(group, [item]);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((group) => ({ group, items: groups.get(group)! }));
}
