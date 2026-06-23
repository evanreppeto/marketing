"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { redeemWorkspaceInviteCodeForUser } from "@/lib/auth/user-provisioning";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/workspace";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function createWorkspaceAction(formData: FormData) {
  const from = getSafeOperatorReturnPath(String(formData.get("from") ?? "/"));
  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: String(formData.get("organizationName") ?? ""),
    workspaceName: String(formData.get("workspaceName") ?? ""),
    workspaceType: String(formData.get("workspaceType") ?? "company"),
  });

  if (result.ok) {
    // Pin the freshly created workspace as active. Without this the resolver falls
    // back to the user's first (older) membership, so creating a new workspace
    // would silently drop them back into their existing one.
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    // New owners go straight into first-run setup; /start self-guards and bounces
    // to `from` once brand capture is done.
    redirect("/start");
  }

  redirect(`/onboarding?error=${encodeURIComponent(result.status)}&from=${encodeURIComponent(from)}`);
}

export async function joinWorkspaceAction(formData: FormData) {
  const from = getSafeOperatorReturnPath(String(formData.get("from") ?? "/"));

  if (!isSupabaseAdminConfigured()) {
    redirect(`/onboarding?error=not_configured&from=${encodeURIComponent(from)}`);
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    redirect(`/login?from=${encodeURIComponent("/onboarding")}`);
  }

  const result = await redeemWorkspaceInviteCodeForUser(
    getSupabaseAdminClient(),
    user,
    String(formData.get("inviteCode") ?? ""),
  );

  if (result.ok) {
    redirect(from === "/onboarding" ? "/" : from);
  }

  redirect(`/onboarding?error=${encodeURIComponent(result.status)}&from=${encodeURIComponent(from)}`);
}
