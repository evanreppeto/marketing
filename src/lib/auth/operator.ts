import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Operator access gate. A single shared-secret cookie protects the human-facing
 * console. The gate is OPT-IN: when OPERATOR_ACCESS_TOKEN is unset (local dev),
 * everything stays open. Set the env var in any shared/prod deployment to require
 * login. The API endpoints are not covered here; they carry their own bearer
 * tokens (see lib/auth/api-token.ts) for programmatic callers.
 */
export const OPERATOR_COOKIE = "signal_operator";

export function isOperatorGateEnabled() {
  return Boolean(process.env.OPERATOR_ACCESS_TOKEN);
}

export function isValidOperatorValue(value: string | undefined) {
  const token = process.env.OPERATOR_ACCESS_TOKEN;
  return Boolean(token) && value === token;
}

/**
 * Defense-in-depth check for mutating server actions. Redirects to /login when
 * the gate is enabled and the caller isn't signed in; no-op when the gate is off.
 */
export async function requireOperator() {
  if (!isOperatorGateEnabled()) {
    return;
  }

  const store = await cookies();

  if (!isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
    redirect("/login");
  }
}
