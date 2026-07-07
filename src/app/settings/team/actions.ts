"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sendWorkspaceInviteEmail } from "@/lib/auth/send-invite-email";
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

  // Email the invitee a branded link to the accept-invite screen (Resend). The
  // code + link still work if delivery fails — we just flag whether it sent.
  let emailed = false;
  if (invitedEmail) {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "";
    const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
    if (host) {
      const sent = await sendWorkspaceInviteEmail({ code: result.code, invitedEmail, origin: `${proto}://${host}` });
      emailed = sent.emailed;
    }
  }

  // Surface the code + shareable link so the owner can share it directly too.
  const parts = [`code=${encodeURIComponent(result.code)}`];
  if (invitedEmail) parts.push(`for=${encodeURIComponent(invitedEmail)}`);
  if (emailed) parts.push("emailed=1");
  redirect(`${TEAM_PATH}?${parts.join("&")}`);
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
