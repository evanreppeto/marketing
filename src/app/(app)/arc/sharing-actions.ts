"use server";

import { revalidatePath } from "next/cache";

import { isSharePermission, isShareVisibility, type SharePermission, type ShareVisibility } from "@/domain";
import {
  assertConversationAccess,
  listConversationShares,
  setConversationVisibility,
  shareConversation,
  unshareConversation,
} from "@/lib/arc-chat/sharing";
import { getConversation } from "@/lib/arc-chat/persistence";
import { requireOperator } from "@/lib/auth/operator";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Chat sharing actions — the UI glue over the (already-built) sharing backend
 * (src/lib/arc-chat/sharing.ts). Chats are per-person: each conversation has an
 * owner and is private by default. These actions let the owner/collaborators open
 * it to the workspace or share it with specific members.
 *
 * Gate: requireOperator (human) + assertConversationAccess("collaborate") so only
 * someone who can already collaborate on the chat may change who else can see it.
 * All no-op safely without a backend; enforcement itself is active only in the
 * supabase auth mode (open/dev mode is intentionally wide open).
 */

export type ShareActionResult = { ok: true } | { ok: false; error: string };

const NO_BACKEND: ShareActionResult = { ok: false, error: "Sharing needs a connected backend." };

/** Set a chat's visibility (private ↔ workspace) and the permission workspace
 *  members get when it's workspace-visible (view or collaborate). */
export async function setChatSharingAction(input: {
  conversationId: string;
  visibility: ShareVisibility;
  workspacePermission: SharePermission;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  if (!isShareVisibility(input.visibility) || !isSharePermission(input.workspacePermission)) {
    return { ok: false, error: "Invalid sharing settings." };
  }
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    await setConversationVisibility(input.conversationId, input.visibility, input.workspacePermission);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't update sharing." };
  }
}

/** Share a chat with a specific workspace member at the given permission. */
export async function shareChatWithMemberAction(input: {
  conversationId: string;
  userId: string;
  permission: SharePermission;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  if (!input.userId.trim() || !isSharePermission(input.permission)) {
    return { ok: false, error: "Pick a member and a permission." };
  }
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    const me = await getSupabaseAuthenticatedUser().catch(() => null);
    await shareConversation(input.conversationId, input.userId, input.permission, me?.id ?? null);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't share the chat." };
  }
}

/** Remove a member's direct access to a chat. */
export async function unshareChatMemberAction(input: {
  conversationId: string;
  userId: string;
}): Promise<ShareActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NO_BACKEND;
  try {
    await assertConversationAccess(input.conversationId, "collaborate");
    await unshareConversation(input.conversationId, input.userId);
    revalidatePath("/arc");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't remove access." };
  }
}

/** Current direct shares on a chat, for rendering the share dialog. */
export async function listChatSharesAction(conversationId: string) {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return [];
  try {
    await assertConversationAccess(conversationId, "view");
    return await listConversationShares(conversationId);
  } catch {
    return [];
  }
}

export type ChatShareMember = { userId: string; email: string | null; permission: SharePermission | null };
export type ChatSharingState = {
  visibility: ShareVisibility;
  workspacePermission: SharePermission;
  /** Members already granted direct access (with their permission). */
  shared: ChatShareMember[];
  /** Other workspace members who can be added. */
  addable: ChatShareMember[];
};

/**
 * Everything the share dialog needs in one call: the chat's current visibility +
 * workspace permission, the members it's directly shared with, and the remaining
 * workspace members who could be added. Empty/default offline — enforcement and
 * real membership only exist in supabase auth mode.
 */
export async function getChatSharingStateAction(conversationId: string): Promise<ChatSharingState> {
  const fallback: ChatSharingState = { visibility: "private", workspacePermission: "view", shared: [], addable: [] };
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return fallback;
  try {
    await assertConversationAccess(conversationId, "view");
    const conversation = await getConversation(conversationId);
    if (!conversation) return fallback;
    const ctx = await getCurrentWorkspaceContext().catch(() => null);
    const shares = await listConversationShares(conversationId);
    const sharePermByUser = new Map(shares.map((s) => [s.userId, s.permission]));

    // Resolve member emails for the picker (workspace-scoped).
    const team = ctx?.workspaceId ? await listWorkspaceTeamAccess(ctx.workspaceId) : null;
    const members = team && team.ok ? team.members : [];
    const emailByUser = new Map(members.filter((m) => m.userId).map((m) => [m.userId as string, m.email]));

    const shared: ChatShareMember[] = shares.map((s) => ({
      userId: s.userId,
      email: emailByUser.get(s.userId) ?? null,
      permission: s.permission,
    }));
    const addable: ChatShareMember[] = members
      .filter((m) => m.userId && m.userId !== conversation.ownerId && !sharePermByUser.has(m.userId))
      .map((m) => ({ userId: m.userId as string, email: m.email, permission: null }));

    return {
      visibility: conversation.visibility,
      workspacePermission: conversation.workspacePermission,
      shared,
      addable,
    };
  } catch {
    return fallback;
  }
}
