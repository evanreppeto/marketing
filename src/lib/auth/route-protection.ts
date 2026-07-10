import { type AuthMode } from "./auth-mode";

type WorkspaceAccessDecisionInput = {
  hasWorkspace: boolean;
  isSignedIn: boolean;
  pathname: string;
};

export type WorkspaceAccessDecision = { action: "allow" | "login" | "onboarding" | "app" };

export function getWorkspaceAccessDecision(input: WorkspaceAccessDecisionInput): WorkspaceAccessDecision {
  // Accepting an invite is public: reachable signed-out (create an account that
  // joins the workspace) and signed-in without a workspace (accept to get one).
  // The page itself branches on the session, so allow every state here.
  if (input.pathname === "/accept-invite" || input.pathname.startsWith("/accept-invite/")) {
    return { action: "allow" };
  }
  if (!input.isSignedIn) return { action: "login" };
  if (input.hasWorkspace) {
    // A signed-in member hitting the root goes into the app (/home) rather than
    // sitting on the bare redirect page.
    if (input.pathname === "/") return { action: "app" };
    return { action: "allow" };
  }
  if (input.pathname === "/onboarding" || input.pathname.startsWith("/onboarding/")) return { action: "allow" };
  return { action: "onboarding" };
}

const STATIC_ASSET_RE = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|map|json|txt|xml|webmanifest)$/i;

/**
 * Which paths bypass the auth gate.
 *
 * - Static assets (anything with an asset extension) are ALWAYS public, so the
 *   login screen can render its styles, scripts, and images.
 * - In open / operator mode the root landing stays public (the no-login demo);
 *   the rest of open mode is let through separately in `proxy.ts`.
 * - In supabase mode nothing here is public: the root and every app route require
 *   a signed-in member, so an unauthenticated visitor is sent to the standalone
 *   `/login` page (the auth pages themselves — /login, /sign-up, /forgot-password,
 *   /reset-password — are exempted by the proxy matcher, not here).
 *
 * Pure + edge-safe so `proxy.ts` can call it and it can be unit-tested.
 */
export function isPublicPath(pathname: string, authMode: AuthMode): boolean {
  if (STATIC_ASSET_RE.test(pathname)) return true;
  if (authMode !== "supabase") return pathname === "/";
  return false;
}
