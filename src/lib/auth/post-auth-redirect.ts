import type { ProvisionUserResult } from "./user-provisioning";

/**
 * Maps a `provisionAuthenticatedUser` result to the absolute URL an authenticated
 * user should be redirected to. Shared by both post-sign-in routes
 * (`/auth/callback` for OAuth, `/auth/confirm` for email links) so the routing
 * stays identical regardless of how the session was established.
 */
export function authedRedirectLocation(
  provisioned: ProvisionUserResult,
  next: string,
  origin: string,
): string {
  if (!provisioned.ok) {
    return new URL(`/login?error=provision&from=${encodeURIComponent(next)}`, origin).toString();
  }
  if (provisioned.status === "invited_member") {
    return new URL(`/welcome?from=${encodeURIComponent(next)}`, origin).toString();
  }
  if (provisioned.status === "profile_only") {
    return new URL(`/onboarding?from=${encodeURIComponent(next)}`, origin).toString();
  }
  return new URL(next, origin).toString();
}
