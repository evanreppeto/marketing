"use server";

import { redirect } from "next/navigation";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { redeemWorkspaceInviteCodeForUser } from "@/lib/auth/user-provisioning";
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
    redirect(from === "/onboarding" ? "/" : from);
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
