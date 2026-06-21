import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured, type TypedSupabaseClient } from "@/lib/supabase/server";

import { ASSIGNABLE_WORKSPACE_ROLES, isAssignableRole, type WorkspaceRoleKey } from "./workspace-roles";

export type UserWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  workspaceStatus: string;
  orgId: string;
  orgName: string;
  role: string;
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
    .select("role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ role: string; status: string }>();

  if (error) throw error;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { ok: false as const, status: "not_authorized" as const, message: "Only workspace owners and admins can manage the team." };
  }

  return { ok: true as const, client, user, role: membership.role };
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

async function fetchTargetMembership(client: TypedSupabaseClient, workspaceId: string, membershipId: string) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("id,role,user_id,status")
    .eq("id", membershipId)
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ id: string; role: string; user_id: string | null; status: string }>();
  if (error) throw error;
  return data ?? null;
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

    return { ok: true };
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "The member could not be removed." };
  }
}
