"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { type MediaConfig, parseMediaConfig } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { sendWorkspaceInviteEmail } from "@/lib/auth/send-invite-email";
import { changeWorkspaceMemberRole, removeWorkspaceMember } from "@/lib/auth/workspace-admin";
import { ACTIVE_WORKSPACE_COOKIE, getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { cancelWorkspaceInvite, issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";
import { saveWorkspaceMediaConfig } from "@/lib/media-config/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Real operator writes for the Settings team/workspace surfaces. Both are
 * internal account operations (an invite is a single-use code; a workspace is a
 * new org) — nothing outbound beyond the branded invite email, which only sends
 * when a workspace is actually connected. `persisted: false` is the honest
 * offline signal so the UI can show the item optimistically without claiming a
 * real invite/workspace was created.
 */
export type SettingsWriteResult =
  | { ok: true; persisted: boolean; message?: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createInvite(input: {
  email: string;
  role: string;
  expiresInDays?: number;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const email = input.email?.trim();
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };

  // Offline/demo: no DB. Report success-but-unpersisted so the pending list can
  // show it without claiming a real invite was issued.
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace to invite into yet." };

  const result = await issueWorkspaceInviteCode({
    workspaceId: ctx.workspaceId,
    invitedEmail: email,
    role: input.role?.toLowerCase(),
    expiresInDays: input.expiresInDays,
  });
  if (!result.ok) return { ok: false, error: result.message ?? "Could not create the invite." };

  // Best-effort branded email — a send hiccup must not fail the invite.
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) await sendWorkspaceInviteEmail({ code: result.code, invitedEmail: email, origin: `${proto}://${host}` });
  } catch {
    // ignore; the invite code is still valid and shown in the list
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Invite sent to ${email}.` };
}

function humanizeWorkspaceError(status: string, message?: string): string {
  switch (status) {
    case "not_authenticated":
      return "Sign in to create a workspace.";
    case "invalid_input":
      return "Enter an organization and workspace name.";
    default:
      return message ?? "Could not create the workspace.";
  }
}

export async function createWorkspace(input: {
  organizationName: string;
  workspaceName: string;
  workspaceType: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const org = input.organizationName?.trim();
  const workspace = input.workspaceName?.trim();
  if (!workspace) return { ok: false, error: "A workspace name is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: org || workspace,
    workspaceName: workspace,
    workspaceType: input.workspaceType || "company",
  });
  if (!result.ok) return { ok: false, error: humanizeWorkspaceError(result.status, result.message) };

  // Pin the new workspace as active so the resolver doesn't fall back to an
  // older membership (mirrors createWorkspaceAction).
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Created ${workspace}.` };
}

function humanizeMemberError(status: string, message?: string): string {
  switch (status) {
    case "not_authenticated":
      return "Sign in to manage the team.";
    case "not_authorized":
      return message ?? "Only workspace owners and admins can manage the team.";
    case "invalid_input":
      return message ?? "That member could not be found.";
    default:
      return message ?? "The change could not be saved.";
  }
}

export async function changeMemberRole(input: {
  workspaceId: string;
  membershipId: string;
  role: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.membershipId?.trim()) return { ok: false, error: "A member is required." };

  // Offline/demo: no DB. Report success-but-unpersisted so the UI can update optimistically.
  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await changeWorkspaceMemberRole({
    workspaceId: input.workspaceId,
    membershipId: input.membershipId,
    role: input.role?.toLowerCase(),
  });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
  return { ok: true, persisted: true };
}

export async function removeMember(input: {
  workspaceId: string;
  membershipId: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.membershipId?.trim()) return { ok: false, error: "A member is required." };

  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await removeWorkspaceMember({ workspaceId: input.workspaceId, membershipId: input.membershipId });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
  return { ok: true, persisted: true };
}

export async function cancelInvite(input: {
  workspaceId: string;
  inviteId: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.inviteId?.trim()) return { ok: false, error: "An invite is required." };

  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await cancelWorkspaceInvite({ workspaceId: input.workspaceId, inviteId: input.inviteId });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
  return { ok: true, persisted: true };
}

/**
 * Persist the workspace's media generation config (Layer 2 model selection).
 * Operator-gated through the authenticated workspace context; scoped to the
 * caller's workspace. The payload is re-normalized via parseMediaConfig so an
 * invalid model id from the client is dropped to "auto" before it lands.
 */
export async function saveMediaConfigAction(config: MediaConfig): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return;
  await saveWorkspaceMediaConfig(getSupabaseAdminClient(), {
    workspaceId: ctx.workspaceId,
    orgId: ctx.orgId,
    config: parseMediaConfig(config),
  });
  revalidatePath("/settings");
}
