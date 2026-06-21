"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/workspace";
import { changeWorkspaceMemberRole, removeWorkspaceMember } from "@/lib/auth/workspace-admin";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type WorkspaceActionState = { ok: boolean; message: string } | null;

/** Switch the active workspace by pinning the cookie the context resolver reads. */
export async function setActiveWorkspaceAction(
  _previous: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  if (!workspaceId) return { ok: false, message: "Pick a workspace to switch to." };
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured." };

  const user = await getSupabaseAuthenticatedUser();
  if (!user) return { ok: false, message: "Sign in before switching workspaces." };

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("workspace_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, message: "Could not verify your access to that workspace." };
  if (!data) return { ok: false, message: "You're not a member of that workspace." };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true, message: "Workspace switched." };
}

export async function changeMemberRoleAction(
  _previous: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const result = await changeWorkspaceMemberRole({
    workspaceId: String(formData.get("workspaceId") ?? ""),
    membershipId: String(formData.get("membershipId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });

  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/settings");
  return { ok: true, message: "Role updated." };
}

export async function removeMemberAction(
  _previous: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const result = await removeWorkspaceMember({
    workspaceId: String(formData.get("workspaceId") ?? ""),
    membershipId: String(formData.get("membershipId") ?? ""),
  });

  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/settings");
  return { ok: true, message: "Member removed." };
}
