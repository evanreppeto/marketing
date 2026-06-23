import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthMode } from "./auth-mode";
import {
  OPERATOR_COOKIE,
  getConfiguredOperatorCredentials,
  isOperatorGateEnabled,
  isValidOperatorValue,
} from "./operator-shared";
import { createSupabaseAuthServerClient, getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

/**
 * Operator access gate. A single shared-secret cookie protects the human-facing
 * console. The gate is OPT-IN: when OPERATOR_ACCESS_TOKEN is unset (local dev),
 * everything stays open. Set the env var in any shared/prod deployment to require
 * login. The API endpoints are not covered here; they carry their own bearer
 * tokens (see lib/auth/api-token.ts) for programmatic callers.
 */
export { OPERATOR_COOKIE, isOperatorGateEnabled, isValidOperatorValue };

/**
 * Defense-in-depth check for mutating server actions. Redirects to /login when
 * the gate is enabled and the caller isn't signed in; no-op when the gate is off.
 */
export async function requireOperator() {
  const authMode = getAuthMode();

  if (authMode === "open") {
    return;
  }

  if (authMode === "supabase") {
    const supabase = await createSupabaseAuthServerClient();
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;

    if (!user) {
      redirect("/login");
    }

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      redirect("/onboarding");
    }

    return;
  }

  const store = await cookies();

  if (!isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
    redirect("/login");
  }
}

/**
 * Identity recorded against operator actions in audit logs / decisions. In
 * Supabase auth mode this resolves to the *signed-in* user (their display name,
 * else email) so multi-user workspaces get a real per-actor audit trail. Falls
 * back to the configured operator email, then a neutral label for open local dev.
 */
export async function getOperatorActor(): Promise<string> {
  if (getAuthMode() === "supabase") {
    const user = await getSupabaseAuthenticatedUser();
    const fullName =
      typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    if (fullName) return fullName;
    if (user?.email) return user.email;
  }
  return getConfiguredOperatorCredentials()?.email ?? "Operator";
}

/**
 * Stable identity key for per-user external integrations.
 *
 * `getOperatorActor()` is a human-facing audit label and may use a display name.
 * OAuth rows need a durable key so reconnects, health checks, picker tokens, and
 * imports all read the same saved connection.
 */
export async function getOperatorIntegrationKey(): Promise<string> {
  if (getAuthMode() === "supabase") {
    const user = await getSupabaseAuthenticatedUser();
    const email = user?.email?.trim().toLowerCase();

    if (email) return email;
    if (user?.id) return user.id;
  }

  return getConfiguredOperatorCredentials()?.email ?? "Operator";
}
