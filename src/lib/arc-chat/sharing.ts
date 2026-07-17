import { type SupabaseClient } from "@supabase/supabase-js";

import {
  type AccessDecision,
  type ShareableResource,
  type SharePermission,
  type ShareVisibility,
  hasRequiredPermission,
  resolveResourceAccess,
} from "@/domain";

import { getAuthMode } from "../auth/auth-mode";
import { getCurrentWorkspaceContext, resolveSoleOrgId } from "../auth/workspace";
import { getSupabaseAuthenticatedUser } from "../supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

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

/** Owner + tenancy to stamp on newly created Arc rows. Owner is null in open/dev mode. */
export async function getCreationTenancy(): Promise<{
  ownerId: string | null;
  workspaceId: string | null;
  orgId: string | null;
}> {
  const viewer = await getShareViewer();
  if (!viewer.enforce || !viewer.userId) {
    // No session, so no user to derive an org from. Defer to the shared resolver
    // rather than restating the rule here: a private second copy of "when may I
    // pick an org" is exactly how the two drift apart, and this path only needs
    // the org (workspace_id is nullable on these rows and stays null here).
    // Unconfigured Supabase means no org to find and no writer to need one.
    if (!isSupabaseAdminConfigured()) return { ownerId: null, workspaceId: null, orgId: null };
    return { ownerId: null, workspaceId: null, orgId: await resolveSoleOrgId() };
  }
  try {
    const ctx = await getCurrentWorkspaceContext();
    return { ownerId: viewer.userId, workspaceId: ctx.workspaceId, orgId: ctx.orgId };
  } catch {
    return { ownerId: viewer.userId, workspaceId: null, orgId: null };
  }
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

/**
 * Resolve access from an ALREADY-FETCHED conversation, skipping the
 * conversation-row read. Callers that loaded the row to render it (the Arc page)
 * use this to avoid fetching the same row twice on every thread open. The direct
 * share + project-cascade lookups still run — the row alone can't answer those.
 */
export async function resolveConversationAccessFor(
  conversation: ShareableResource & { id: string; projectId: string | null },
  viewer: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  if (!viewer.enforce) return FULL_ACCESS;

  const directShare = viewer.userId
    ? await getConversationShare(conversation.id, viewer.userId, client)
    : null;
  // Project cascade: a chat inside an accessible project inherits its grant.
  const inheritedShare = conversation.projectId
    ? (await resolveProjectAccess(conversation.projectId, viewer, client)).permission
    : null;

  return resolveResourceAccess(
    {
      ownerId: conversation.ownerId,
      workspaceId: conversation.workspaceId,
      visibility: conversation.visibility,
      workspacePermission: conversation.workspacePermission,
    },
    {
      userId: viewer.userId,
      isWorkspaceMember:
        !!conversation.workspaceId && viewer.workspaceIds.includes(conversation.workspaceId),
      directShare,
      inheritedShare,
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
    .select("id,owner_id,workspace_id,visibility,workspace_permission,project_id")
    .eq("id", conversationId)
    .maybeSingle<ResourceRow & { id: string; project_id: string | null }>();
  if (!data) return { canView: false, permission: null };

  return resolveConversationAccessFor(
    {
      id: data.id,
      ownerId: data.owner_id,
      workspaceId: data.workspace_id,
      visibility: data.visibility,
      workspacePermission: data.workspace_permission,
      projectId: data.project_id,
    },
    viewer,
    client,
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

export async function assertProjectAccess(
  projectId: string,
  required: SharePermission,
  viewer?: ShareViewer,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AccessDecision> {
  const resolvedViewer = viewer ?? (await getShareViewer(client));
  const decision = await resolveProjectAccess(projectId, resolvedViewer, client);
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
