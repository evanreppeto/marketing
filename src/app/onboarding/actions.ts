"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { redeemWorkspaceInviteCodeForUser } from "@/lib/auth/user-provisioning";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/workspace";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";
import { DEFAULT_APP_SETTINGS, normalizeDisplayLabel, saveAppSettings } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

// Create a brand-new org + workspace for the signed-in user and make them owner.
export async function createWorkspaceAction(formData: FormData) {
  const from = getSafeOperatorReturnPath(String(formData.get("from") ?? "/"));

  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: String(formData.get("organizationName") ?? ""),
    workspaceName: String(formData.get("workspaceName") ?? ""),
    workspaceType: String(formData.get("workspaceType") ?? "company"),
  });

  if (result.ok) {
    // Persist the (optional) industry onto the new workspace's app_settings so the
    // connector catalog can recommend for it from day one. Best-effort — never
    // blocks onboarding if it fails.
    const industry = normalizeDisplayLabel(String(formData.get("industry") ?? ""), DEFAULT_APP_SETTINGS.industry, 60);
    if (industry && isSupabaseAdminConfigured()) {
      try {
        await saveAppSettings(getSupabaseAdminClient(), result.orgId, { industry });
      } catch {
        // ignore — the operator can set the industry later in Settings → General.
      }
    }

    // Pin the freshly created workspace as active so the resolver doesn't fall
    // back to an older membership.
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    redirect(from);
  }

  redirect(`/onboarding?error=${encodeURIComponent(result.status)}&from=${encodeURIComponent(from)}`);
}

// Redeem an invite code to join an existing workspace instead of creating one.
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
    redirect(from);
  }

  redirect(`/onboarding?error=${encodeURIComponent(result.status)}&from=${encodeURIComponent(from)}`);
}
