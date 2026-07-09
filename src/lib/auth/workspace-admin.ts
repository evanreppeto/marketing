import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured, type TypedSupabaseClient } from "@/lib/supabase/server";

import { recordWorkspaceAudit } from "./workspace-audit";
import { ASSIGNABLE_WORKSPACE_ROLES, isAssignableRole, roleLabel, type WorkspaceRoleKey } from "./workspace-roles";

export type UserWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  workspaceStatus: string;
  orgId: string;
  orgName: string;
  role: string;
};

export type WorkspaceActivityEntry = {
  id: string;
  action: string;
  summary: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type MemberMutationResult =
  | { ok: true }
  | {
      ok: false;
      status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed";
      message: string;
    };

/** Owner/admin guard for member management, mirroring workspace-invites.ts. */
async function requireWorkspaceAdmin(workspaceId: string) {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false as const, status: "not_configured" as const, message: "Supabase admin env vars are required." };
  }
  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return { ok: false as const, status: "not_authenticated" as const, message: "Sign in before managing the team." };
  }

  const client = getSupabaseAdminClient();
  const { data: membership, error } = await client
    .from("workspace_memberships")
    .select("org_id,role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ org_id: string; role: string; status: string }>();

  if (error) throw error;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { ok: false as const, status: "not_authorized" as const, message: "Only workspace owners and admins can manage the team." };
  }

  return { ok: true as const, client, user, role: membership.role, orgId: membership.org_id };
}

/** Every active workspace the signed-in user belongs to, with org + role context. */
export async function listWorkspacesForUser(): Promise<UserWorkspace[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const user = await getSupabaseAuthenticatedUser();
  if (!user) return [];

  const client = getSupabaseAdminClient();
  const { data: memberships, error } = await client
    .from("workspace_memberships")
    .select("workspace_id,org_id,role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !memberships?.length) return [];

  const workspaceIds = [...new Set(memberships.map((row) => row.workspace_id))];
  const orgIds = [...new Set(memberships.map((row) => row.org_id))];

  const [{ data: workspaces }, { data: orgs }] = await Promise.all([
    client.from("workspaces").select("id,name,workspace_type,status").in("id", workspaceIds),
    client.from("organizations").select("id,name").in("id", orgIds),
  ]);

  const workspaceById = new Map((workspaces ?? []).map((row) => [row.id, row]));
  const orgById = new Map((orgs ?? []).map((row) => [row.id, row]));

  return memberships
    .map((row) => {
      const workspace = workspaceById.get(row.workspace_id);
      if (!workspace) return null;
      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceType: workspace.workspace_type,
        workspaceStatus: workspace.status,
        orgId: row.org_id,
        orgName: orgById.get(row.org_id)?.name ?? "Organization",
        role: row.role,
      } satisfies UserWorkspace;
    })
    .filter((value): value is UserWorkspace => value !== null);
}

/** Recent audit events for a workspace (admin-only), with actor emails resolved. */
export async function listWorkspaceActivity(workspaceId: string, limit = 12): Promise<WorkspaceActivityEntry[]> {
  const access = await requireWorkspaceAdmin(workspaceId.trim());
  if (!access.ok) return [];

  const { data, error } = await access.client
    .from("audit_events")
    .select("id,action,summary,actor_user_id,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  const actorIds = [...new Set(data.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  let emailByActor = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: profiles } = await access.client.from("profiles").select("id,email").in("id", actorIds);
    emailByActor = new Map((profiles ?? []).map((row) => [row.id, row.email ?? null]));
  }

  return data.map((row) => ({
    id: row.id,
    action: row.action,
    summary: row.summary ?? null,
    actorEmail: row.actor_user_id ? emailByActor.get(row.actor_user_id) ?? null : null,
    createdAt: row.created_at,
  }));
}

async function fetchTargetMembership(client: TypedSupabaseClient, workspaceId: string, membershipId: string) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("id,role,user_id,invited_email,status")
    .eq("id", membershipId)
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ id: string; role: string; user_id: string | null; invited_email: string | null; status: string }>();
  if (error) throw error;
  return data ?? null;
}

function memberLabel(email: string | null): string {
  return email ?? "a member";
}

/** Change a member's workspace role. Owners can't be re-roled; you can't change your own. */
export async function changeWorkspaceMemberRole(input: {
  workspaceId: string;
  membershipId: string;
  role: string;
}): Promise<MemberMutationResult> {
  const workspaceId = input.workspaceId.trim();
  const membershipId = input.membershipId.trim();
  if (!workspaceId || !membershipId) return { ok: false, status: "invalid_input", message: "Workspace and member are required." };
  if (!isAssignableRole(input.role)) {
    return { ok: false, status: "invalid_input", message: `Role must be one of: ${ASSIGNABLE_WORKSPACE_ROLES.join(", ")}.` };
  }
  const nextRole: WorkspaceRoleKey = input.role;

  try {
    const access = await requireWorkspaceAdmin(workspaceId);
    if (!access.ok) return access;

    const target = await fetchTargetMembership(access.client, workspaceId, membershipId);
    if (!target) return { ok: false, status: "invalid_input", message: "That member could not be found." };
    if (target.role === "owner") return { ok: false, status: "not_authorized", message: "The workspace owner's role can't be changed here." };
    if (target.user_id && target.user_id === access.user.id) {
      return { ok: false, status: "not_authorized", message: "You can't change your own role." };
    }

    const { error } = await access.client
      .from("workspace_memberships")
      .update({ role: nextRole })
      .eq("id", membershipId)
      .eq("workspace_id", workspaceId);
    if (error) throw error;

    await recordWorkspaceAudit({
      orgId: access.orgId,
      workspaceId,
      actorUserId: access.user.id,
      action: "member.role_changed",
      summary: `Changed ${memberLabel(target.invited_email)} to ${roleLabel(nextRole)}`,
      subjectTable: "workspace_memberships",
      subjectId: membershipId,
      metadata: { from: target.role, to: nextRole },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "The role could not be updated." };
  }
}

/** Remove a member from the workspace (status → removed). Owners and self are protected. */
export async function removeWorkspaceMember(input: {
  workspaceId: string;
  membershipId: string;
}): Promise<MemberMutationResult> {
  const workspaceId = input.workspaceId.trim();
  const membershipId = input.membershipId.trim();
  if (!workspaceId || !membershipId) return { ok: false, status: "invalid_input", message: "Workspace and member are required." };

  try {
    const access = await requireWorkspaceAdmin(workspaceId);
    if (!access.ok) return access;

    const target = await fetchTargetMembership(access.client, workspaceId, membershipId);
    if (!target) return { ok: false, status: "invalid_input", message: "That member could not be found." };
    if (target.role === "owner") return { ok: false, status: "not_authorized", message: "The workspace owner can't be removed here." };
    if (target.user_id && target.user_id === access.user.id) {
      return { ok: false, status: "not_authorized", message: "You can't remove yourself." };
    }

    const { error } = await access.client
      .from("workspace_memberships")
      .update({ status: "removed" })
      .eq("id", membershipId)
      .eq("workspace_id", workspaceId);
    if (error) throw error;

    await recordWorkspaceAudit({
      orgId: access.orgId,
      workspaceId,
      actorUserId: access.user.id,
      action: "member.removed",
      summary: `Removed ${memberLabel(target.invited_email)}`,
      subjectTable: "workspace_memberships",
      subjectId: membershipId,
      metadata: { role: target.role },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "The member could not be removed." };
  }
}

/**
 * Rename the active workspace (and its organization, which is the name shown
 * across the app and used as Arc's outbound from-name). Owner/admin only. The
 * organization + workspace rows carry the display identity that
 * getCurrentWorkspaceContext() resolves, so both are kept in sync here.
 */
export async function renameWorkspace(input: {
  workspaceId: string;
  name: string;
}): Promise<MemberMutationResult> {
  const workspaceId = input.workspaceId.trim();
  const name = input.name.trim().slice(0, 80);
  if (!workspaceId) return { ok: false, status: "invalid_input", message: "A workspace is required." };
  if (!name) return { ok: false, status: "invalid_input", message: "A workspace name is required." };

  try {
    const access = await requireWorkspaceAdmin(workspaceId);
    if (!access.ok) return access;

    const [{ error: orgError }, { error: wsError }] = await Promise.all([
      access.client.from("organizations").update({ name }).eq("id", access.orgId),
      access.client.from("workspaces").update({ name }).eq("id", workspaceId),
    ]);
    if (orgError) throw orgError;
    if (wsError) throw wsError;

    await recordWorkspaceAudit({
      orgId: access.orgId,
      workspaceId,
      actorUserId: access.user.id,
      action: "workspace.renamed",
      summary: `Renamed the workspace to ${name}`,
      subjectTable: "workspaces",
      subjectId: workspaceId,
      metadata: { name },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "The workspace could not be renamed." };
  }
}
