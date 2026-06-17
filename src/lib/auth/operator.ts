import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthMode } from "./auth-mode";
import {
  OPERATOR_COOKIE,
  getConfiguredOperatorCredentials,
  isOperatorGateEnabled,
  isValidOperatorValue,
} from "./operator-shared";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

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
    const user = await getSupabaseAuthenticatedUser();

    if (!user) {
      redirect("/login");
    }

    return;
  }

  const store = await cookies();

  if (!isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
    redirect("/login");
  }
}

/**
 * Identity recorded against operator actions in audit logs / decisions. Uses the
 * configured operator email when set, else a neutral label for open local dev.
 * Single shared-secret gate today, so this is the one operator account — when a
 * real multi-user auth lands, swap this for the session's user.
 */
export function getOperatorActor(): string {
  return getConfiguredOperatorCredentials()?.email ?? "Operator";
}
