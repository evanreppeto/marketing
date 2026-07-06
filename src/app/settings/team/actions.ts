"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import {
  cancelWorkspaceInvite,
  issueWorkspaceInviteCode,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/auth/workspace-invites";

const TEAM_PATH = "/settings/team";

async function requireWorkspaceId() {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) redirect("/onboarding");
  return ctx.workspaceId;
}

export async function inviteMemberAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const invitedEmail = String(formData.get("invitedEmail") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  const result = await issueWorkspaceInviteCode({
    workspaceId,
    invitedEmail: invitedEmail || undefined,
    role,
  });

  if (!result.ok) {
    redirect(`${TEAM_PATH}?error=${encodeURIComponent(result.status)}`);
  }

  revalidatePath(TEAM_PATH);
  // Surface the code so the owner can share it (invitee enters it on /onboarding).
  const forParam = invitedEmail ? `&for=${encodeURIComponent(invitedEmail)}` : "";
  redirect(`${TEAM_PATH}?code=${encodeURIComponent(result.code)}${forParam}`);
}

export async function revokeInviteAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const result = await cancelWorkspaceInvite({ workspaceId, inviteId: String(formData.get("inviteId") ?? "") });
  if (!result.ok) redirect(`${TEAM_PATH}?error=${encodeURIComponent(result.status)}`);
  revalidatePath(TEAM_PATH);
  redirect(TEAM_PATH);
}

export async function changeRoleAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const result = await updateWorkspaceMemberRole({
    workspaceId,
    memberId: String(formData.get("memberId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  if (!result.ok) redirect(`${TEAM_PATH}?error=${encodeURIComponent(result.status)}`);
  revalidatePath(TEAM_PATH);
  redirect(TEAM_PATH);
}

export async function removeMemberAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const result = await removeWorkspaceMember({ workspaceId, memberId: String(formData.get("memberId") ?? "") });
  if (!result.ok) redirect(`${TEAM_PATH}?error=${encodeURIComponent(result.status)}`);
  revalidatePath(TEAM_PATH);
  redirect(TEAM_PATH);
}
