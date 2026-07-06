import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { redeemWorkspaceInviteCodeForUser } from "@/lib/auth/user-provisioning";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * The endpoint the /onboarding screen posts to once a signed-in user has no
 * workspace yet. Two actions:
 *
 *   action=create  → organizationName, workspaceName?, workspaceType?  (default)
 *   action=join    → inviteCode
 *
 * Mirrors the sign-in / sign-up routes: form-encoded in, 303 redirect out.
 * On success → `from` (the app). On failure → /onboarding?error=<code>.
 * Error codes: create → invalid_input | failed | not_configured;
 *              join   → join_invalid_input | join_email_mismatch | join_expired
 *                       | join_not_found | join_failed | join_not_configured.
 */
function onboardingRedirect(origin: string, from: string, error?: string) {
  const url = new URL("/onboarding", origin);
  if (error) url.searchParams.set("error", error);
  url.searchParams.set("from", from);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "create");
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;

  // Onboarding only exists in Supabase auth mode; elsewhere there is no workspace
  // model to join, so just send the caller on to where they were headed.
  if (getAuthMode() !== "supabase") {
    return NextResponse.redirect(new URL(from, origin), { status: 303 });
  }

  // Must be signed in to create or join a workspace.
  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?from=${encodeURIComponent(from)}`, origin), { status: 303 });
  }

  if (action === "join") {
    const inviteCode = String(form.get("inviteCode") ?? "");
    const result = await redeemWorkspaceInviteCodeForUser(getSupabaseAdminClient(), user, inviteCode);
    if (result.ok) {
      return NextResponse.redirect(new URL(from, origin), { status: 303 });
    }
    return onboardingRedirect(origin, from, `join_${result.status}`);
  }

  // Default action: create a brand-new organization + workspace, owned by the user.
  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: String(form.get("organizationName") ?? ""),
    workspaceName: String(form.get("workspaceName") ?? ""),
    workspaceType: String(form.get("workspaceType") ?? "company"),
  });

  if (result.ok) {
    return NextResponse.redirect(new URL(from, origin), { status: 303 });
  }
  if (result.status === "not_authenticated") {
    return NextResponse.redirect(new URL(`/login?from=${encodeURIComponent(from)}`, origin), { status: 303 });
  }
  return onboardingRedirect(origin, from, result.status);
}
