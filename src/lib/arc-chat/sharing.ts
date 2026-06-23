import { type SupabaseClient } from "@supabase/supabase-js";

import {
  type AccessDecision,
  type SharePermission,
  type ShareVisibility,
  hasRequiredPermission,
  resolveResourceAccess,
} from "@/domain";

import { getAuthMode } from "../auth/auth-mode";
import { getSupabaseAuthenticatedUser } from "../supabase/auth-server";
import { getSupabaseAdminClient } from "../supabase/server";

export class ArcAccessError extends Error {
  constructor(message = "You don't have access to this Arc item.") {
    super(message);
    this.name = "ArcAccessError";
  }
}

/** Who is asking, and whether sharing is even enforced (it is not in open/dev mode). */
export type ShareViewer = {
  userId: string | null;
  workspaceIds: string[];
  enforce: boolean;
};

const FULL_ACCESS: AccessDecision = Object.freeze({ canView: true, permission: "collaborate" });

/**
 * Resolve the current viewer. In `open`/dev mode (or when unauthenticated) we do
 * NOT enforce sharing — the app is intentionally wide open there, matching
 * `requireOperator()`. The viewer's active workspace ids are loaded once so the
 * access resolvers don't re-query per resource.
 */
export async function getShareViewer(
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ShareViewer> {
  if (getAuthMode() !== "supabase") {
    return { userId: null, workspaceIds: [], enforce: false };
  }
  // Note: the auth user lookup uses its own session-scoped client (required for auth.getUser); only the membership query below uses the injected `client`.
  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return { userId: null, workspaceIds: [], enforce: false };
  }
  const { data } = await client
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const workspaceIds = ((data ?? []) as { workspace_id: string }[]).map((row) => row.workspace_id);
  return { userId: user.id, workspaceIds, enforce: true };
}

async function getConversationShare(
  conversationId: string,
  userId: string,
  client: SupabaseClient,
): Promise<SharePermission | null> {
  const { data } = await client
    .from("arc_conversation_shares")
    .select("permission")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle<{ permission: SharePermission }>();
  return data?.permission ?? null;
}

async function getProjectShare(
  projectId: string,
  userId: string,
  client: SupabaseClient,
): Promise<SharePermission | null> {
  const { data } = await client
    .from("arc_project_shares")
    .select("permission")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle<{ permission: SharePermission }>();
  return data?.permission ?? null;
}

type ResourceRow = {
  owner_id: string | null;
  workspace_id: string | null;
  visibility: ShareVisibility;
  workspace_permission: SharePermission;
};

export async function resolveProjectAccess(
  projectId: string,
  viewer: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  if (!viewer.enforce) return FULL_ACCESS;
  const { data } = await client
    .from("arc_projects")
    .select("owner_id,workspace_id,visibility,workspace_permission")
    .eq("id", projectId)
    .maybeSingle<ResourceRow>();
  if (!data) return { canView: false, permission: null };
  const directShare = viewer.userId ? await getProjectShare(projectId, viewer.userId, client) : null;
  return resolveResourceAccess(
    {
      ownerId: data.owner_id,
      workspaceId: data.workspace_id,
      visibility: data.visibility,
      workspacePermission: data.workspace_permission,
    },
    {
      userId: viewer.userId,
      isWorkspaceMember: !!data.workspace_id && viewer.workspaceIds.includes(data.workspace_id),
      directShare,
      inheritedShare: null,
    },
  );
}

export async function resolveConversationAccess(
  conversationId: string,
  viewer: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  if (!viewer.enforce) return FULL_ACCESS;
  const { data } = await client
    .from("arc_conversations")
    .select("owner_id,workspace_id,visibility,workspace_permission,project_id")
    .eq("id", conversationId)
    .maybeSingle<ResourceRow & { project_id: string | null }>();
  if (!data) return { canView: false, permission: null };

  const directShare = viewer.userId
    ? await getConversationShare(conversationId, viewer.userId, client)
    : null;
  // Project cascade: a chat inside an accessible project inherits its grant.
  const inheritedShare = data.project_id
    ? (await resolveProjectAccess(data.project_id, viewer, client)).permission
    : null;

  return resolveResourceAccess(
    {
      ownerId: data.owner_id,
      workspaceId: data.workspace_id,
      visibility: data.visibility,
      workspacePermission: data.workspace_permission,
    },
    {
      userId: viewer.userId,
      isWorkspaceMember: !!data.workspace_id && viewer.workspaceIds.includes(data.workspace_id),
      directShare,
      inheritedShare,
    },
  );
}

export async function assertConversationAccess(
  conversationId: string,
  required: SharePermission,
  viewer?: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  const resolvedViewer = viewer ?? (await getShareViewer(client));
  const decision = await resolveConversationAccess(conversationId, resolvedViewer, client);
  if (!hasRequiredPermission(decision, required)) {
    throw new ArcAccessError();
  }
  return decision;
}

// ---- Writes (visibility + share/unshare) ----

export async function setConversationVisibility(
  conversationId: string,
  visibility: ShareVisibility,
  workspacePermission: SharePermission,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_conversations")
    .update({ visibility, workspace_permission: workspacePermission })
    .eq("id", conversationId);
  if (error) throw new Error(`arc_conversations visibility update failed: ${error.message}`);
}

export async function shareConversation(
  conversationId: string,
  userId: string,
  permission: SharePermission,
  sharedBy: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_conversation_shares")
    .upsert(
      { conversation_id: conversationId, user_id: userId, permission, shared_by: sharedBy },
      { onConflict: "conversation_id,user_id" },
    );
  if (error) throw new Error(`arc_conversation_shares upsert failed: ${error.message}`);
}

export async function unshareConversation(
  conversationId: string,
  userId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_conversation_shares")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new Error(`arc_conversation_shares delete failed: ${error.message}`);
}

export async function setProjectVisibility(
  projectId: string,
  visibility: ShareVisibility,
  workspacePermission: SharePermission,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_projects")
    .update({ visibility, workspace_permission: workspacePermission })
    .eq("id", projectId);
  if (error) throw new Error(`arc_projects visibility update failed: ${error.message}`);
}

export async function shareProject(
  projectId: string,
  userId: string,
  permission: SharePermission,
  sharedBy: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_project_shares")
    .upsert(
      { project_id: projectId, user_id: userId, permission, shared_by: sharedBy },
      { onConflict: "project_id,user_id" },
    );
  if (error) throw new Error(`arc_project_shares upsert failed: ${error.message}`);
}

export async function unshareProject(
  projectId: string,
  userId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_project_shares")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`arc_project_shares delete failed: ${error.message}`);
}

/** Current shares on a conversation (for the share dialog). */
export type ConversationShareRow = { userId: string; permission: SharePermission };

export async function listConversationShares(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ConversationShareRow[]> {
  const { data, error } = await client
    .from("arc_conversation_shares")
    .select("user_id,permission")
    .eq("conversation_id", conversationId);
  if (error) throw new Error(`arc_conversation_shares list failed: ${error.message}`);
  return ((data ?? []) as { user_id: string; permission: SharePermission }[]).map((row) => ({
    userId: row.user_id,
    permission: row.permission,
  }));
}
