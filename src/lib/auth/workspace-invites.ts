import { createHash, randomInt } from "node:crypto";

import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { recordWorkspaceAudit } from "./workspace-audit";

export type WorkspaceInviteRole = "admin" | "marketer" | "reviewer" | "member" | "viewer";

type IssueWorkspaceInviteInput = {
  expiresInDays?: number;
  invitedEmail?: string;
  role?: string;
  workspaceId: string;
};

type WorkspaceInviteInput = {
  inviteId: string;
  workspaceId: string;
};

type WorkspaceMemberRoleInput = {
  memberId: string;
  role: string;
  workspaceId: string;
};

type WorkspaceMemberInput = {
  memberId: string;
  workspaceId: string;
};

export type IssueWorkspaceInviteResult =
  | { ok: true; code: string; expiresAt: string; orgId: string; workspaceId: string }
  | { ok: false; status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed"; message: string };

export type WorkspaceTeamMember = {
  email: string | null;
  id: string;
  joinedAt: string | null;
  role: string;
  status: string;
  userId: string | null;
};

export type WorkspaceInviteSummary = {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  invitedEmail: string | null;
  role: string;
  status: string;
};

export type WorkspaceTeamAccessResult =
  | { ok: true; invites: WorkspaceInviteSummary[]; members: WorkspaceTeamMember[] }
  | { ok: false; status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed"; message: string };

export type CancelWorkspaceInviteResult =
  | { ok: true }
  | { ok: false; status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed"; message: string };

export type UpdateWorkspaceMemberRoleResult =
  | { ok: true; role: WorkspaceInviteRole }
  | { ok: false; status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed"; message: string };

export type RemoveWorkspaceMemberResult =
  | { ok: true }
  | { ok: false; status: "not_authenticated" | "not_configured" | "not_authorized" | "invalid_input" | "failed"; message: string };

const inviteRoles = new Set<WorkspaceInviteRole>(["admin", "marketer", "reviewer", "member", "viewer"]);
const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeInviteCode(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 32)
    : "";
}

export function hashInviteCode(value: string) {
  return createHash("sha256").update(normalizeInviteCode(value), "utf8").digest("hex");
}

function normalizeEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeRole(value: string | undefined): WorkspaceInviteRole {
  return inviteRoles.has(value as WorkspaceInviteRole) ? (value as WorkspaceInviteRole) : "member";
}

function isValidRole(value: string): value is WorkspaceInviteRole {
  return inviteRoles.has(value as WorkspaceInviteRole);
}

function expiresAtFromDays(days: number | undefined) {
  const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days as number), 1), 90) : 14;
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function generateInviteCode() {
  const segment = () =>
    Array.from({ length: 4 }, () => inviteAlphabet[randomInt(inviteAlphabet.length)]).join("");
  return `${segment()}-${segment()}`;
}

function isWorkspaceAdmin(role: string) {
  return role === "owner" || role === "admin";
}

async function getCurrentWorkspaceMembership(workspaceId: string) {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false as const, status: "not_configured" as const, message: "Supabase admin env vars are required." };
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return { ok: false as const, status: "not_authenticated" as const, message: "Sign in before managing workspace access." };
  }

  const client = getSupabaseAdminClient();
  const { data: membership, error } = await client
    .from("workspace_memberships")
    .select("id,org_id,role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string; org_id: string; role: string; status: string }>();

  if (error) throw error;
  if (!membership) {
    return { ok: false as const, status: "not_authorized" as const, message: "Workspace membership is required." };
  }

  return { ok: true as const, client, membership, user };
}

export async function issueWorkspaceInviteCode(input: IssueWorkspaceInviteInput): Promise<IssueWorkspaceInviteResult> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return { ok: false, status: "invalid_input", message: "Workspace id is required." };

  try {
    const access = await getCurrentWorkspaceMembership(workspaceId);
    if (!access.ok) return access;
    if (!isWorkspaceAdmin(access.membership.role)) {
      return { ok: false, status: "not_authorized", message: "Only workspace owners and admins can issue invites." };
    }

    const code = generateInviteCode();
    const expiresAt = expiresAtFromDays(input.expiresInDays);
    const invitedEmail = normalizeEmail(input.invitedEmail);
    const role = normalizeRole(input.role);
    const { error: insertError } = await access.client.from("workspace_invites").insert({
      org_id: access.membership.org_id,
      workspace_id: workspaceId,
      code_hash: hashInviteCode(code),
      invited_email: invitedEmail,
      role,
      status: "active",
      expires_at: expiresAt,
      invited_by: access.user.id,
    });

    if (insertError) throw insertError;

    await recordWorkspaceAudit({
      orgId: access.membership.org_id,
      workspaceId,
      actorUserId: access.user.id,
      action: "invite.created",
      summary: `Invite created for ${invitedEmail ?? "anyone"} (${role})`,
      subjectTable: "workspace_invites",
      metadata: { role, invitedEmail },
    });

    return { ok: true, code, expiresAt, orgId: access.membership.org_id, workspaceId };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Workspace invite could not be issued.",
    };
  }
}

export async function listWorkspaceTeamAccess(workspaceIdInput: string): Promise<WorkspaceTeamAccessResult> {
  const workspaceId = workspaceIdInput.trim();
  if (!workspaceId) return { ok: false, status: "invalid_input", message: "Workspace id is required." };

  try {
    const access = await getCurrentWorkspaceMembership(workspaceId);
    if (!access.ok) return access;

    const { data: memberRows, error: memberError } = await access.client
      .from("workspace_memberships")
      .select("id,user_id,invited_email,role,status,joined_at,created_at")
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "invited"])
      .order("created_at", { ascending: true });
    if (memberError) throw memberError;

    const { data: inviteRows, error: inviteError } = await access.client
      .from("workspace_invites")
      .select("id,invited_email,role,status,expires_at,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (inviteError) throw inviteError;

    return {
      ok: true,
      members: (memberRows ?? []).map((row) => ({
        email: row.invited_email ?? null,
        id: row.id,
        joinedAt: row.joined_at ?? null,
        role: row.role,
        status: row.status,
        userId: row.user_id ?? null,
      })),
      invites: (inviteRows ?? []).map((row) => ({
        createdAt: row.created_at,
        expiresAt: row.expires_at ?? null,
        id: row.id,
        invitedEmail: row.invited_email ?? null,
        role: row.role,
        status: row.status,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Workspace access could not be loaded.",
    };
  }
}

export async function cancelWorkspaceInvite(input: WorkspaceInviteInput): Promise<CancelWorkspaceInviteResult> {
  const inviteId = input.inviteId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!inviteId || !workspaceId) return { ok: false, status: "invalid_input", message: "Invite id and workspace id are required." };

  try {
    const access = await getCurrentWorkspaceMembership(workspaceId);
    if (!access.ok) return access;
    if (!isWorkspaceAdmin(access.membership.role)) {
      return { ok: false, status: "not_authorized", message: "Only workspace owners and admins can revoke invites." };
    }

    const { error } = await access.client
      .from("workspace_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    if (error) throw error;

    await recordWorkspaceAudit({
      orgId: access.membership.org_id,
      workspaceId,
      actorUserId: access.user.id,
      action: "invite.revoked",
      summary: "Invite revoked",
      subjectTable: "workspace_invites",
      subjectId: inviteId,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Workspace invite could not be revoked.",
    };
  }
}

async function getTargetMember(
  client: ReturnType<typeof getSupabaseAdminClient>,
  input: WorkspaceMemberInput,
) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("id,org_id,workspace_id,user_id,role,status")
    .eq("id", input.memberId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle<{ id: string; org_id: string; workspace_id: string; user_id: string | null; role: string; status: string }>();

  if (error) throw error;
  return data ?? null;
}

export async function updateWorkspaceMemberRole(input: WorkspaceMemberRoleInput): Promise<UpdateWorkspaceMemberRoleResult> {
  const memberId = input.memberId.trim();
  const workspaceId = input.workspaceId.trim();
  const role = input.role.trim();
  if (!memberId || !workspaceId || !isValidRole(role)) {
    return { ok: false, status: "invalid_input", message: "Member id, workspace id, and a valid role are required." };
  }

  try {
    const access = await getCurrentWorkspaceMembership(workspaceId);
    if (!access.ok) return access;
    if (!isWorkspaceAdmin(access.membership.role)) {
      return { ok: false, status: "not_authorized", message: "Only workspace owners and admins can change member roles." };
    }

    const target = await getTargetMember(access.client, { memberId, workspaceId });
    if (!target || target.status !== "active" || !target.user_id) {
      return { ok: false, status: "invalid_input", message: "Choose an active workspace member." };
    }
    if (target.id === access.membership.id || target.user_id === access.user.id) {
      return { ok: false, status: "not_authorized", message: "You cannot change your own workspace role." };
    }
    if (target.role === "owner") {
      return { ok: false, status: "not_authorized", message: "Owner access cannot be changed here." };
    }

    const { error: updateError } = await access.client
      .from("workspace_memberships")
      .update({ role })
      .eq("id", memberId)
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    if (updateError) throw updateError;

    const orgRole = role === "admin" ? "admin" : "member";
    const { error: orgError } = await access.client
      .from("organization_memberships")
      .update({ role: orgRole })
      .eq("org_id", target.org_id)
      .eq("user_id", target.user_id)
      .eq("status", "active");
    if (orgError) throw orgError;

    return { ok: true, role };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Workspace member role could not be updated.",
    };
  }
}

export async function removeWorkspaceMember(input: WorkspaceMemberInput): Promise<RemoveWorkspaceMemberResult> {
  const memberId = input.memberId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!memberId || !workspaceId) return { ok: false, status: "invalid_input", message: "Member id and workspace id are required." };

  try {
    const access = await getCurrentWorkspaceMembership(workspaceId);
    if (!access.ok) return access;
    if (!isWorkspaceAdmin(access.membership.role)) {
      return { ok: false, status: "not_authorized", message: "Only workspace owners and admins can remove members." };
    }

    const target = await getTargetMember(access.client, { memberId, workspaceId });
    if (!target || target.status !== "active" || !target.user_id) {
      return { ok: false, status: "invalid_input", message: "Choose an active workspace member." };
    }
    if (target.id === access.membership.id || target.user_id === access.user.id) {
      return { ok: false, status: "not_authorized", message: "You cannot remove yourself from the workspace." };
    }
    if (target.role === "owner") {
      return { ok: false, status: "not_authorized", message: "Owner access cannot be removed here." };
    }

    const { error } = await access.client
      .from("workspace_memberships")
      .update({ status: "removed" })
      .eq("id", memberId)
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    if (error) throw error;

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Workspace member could not be removed.",
    };
  }
}
