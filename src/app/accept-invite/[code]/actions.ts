"use server";

import { redirect } from "next/navigation";

import { redeemWorkspaceInviteCodeForUser } from "@/lib/auth/user-provisioning";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

// Signed-in path: the visitor already has an account, so redeem the invite for
// them directly and drop them into the workspace via /welcome.
export async function redeemInviteAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const acceptPath = `/accept-invite/${encodeURIComponent(code)}`;

  if (!isSupabaseAdminConfigured()) {
    redirect(`${acceptPath}?error=not_configured`);
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    redirect(`/login?from=${encodeURIComponent(acceptPath)}`);
  }

  const result = await redeemWorkspaceInviteCodeForUser(getSupabaseAdminClient(), user, code);
  if (result.ok) {
    redirect("/welcome?from=%2Fhome");
  }

  redirect(`${acceptPath}?error=${encodeURIComponent(result.status)}`);
}
