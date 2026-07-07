import { type AuthMode } from "./auth-mode";

type WorkspaceAccessDecisionInput = {
  hasWorkspace: boolean;
  isSignedIn: boolean;
  pathname: string;
};

export type WorkspaceAccessDecision = { action: "allow" | "login" | "onboarding" | "app" };

// The domain root serves the static mockup "home" (`/` rewrites to
// build-home.html in next.config). A signed-in member should land on the real
// app instead, so these front-door paths redirect to /home rather than
// rendering the mockup. Deep mockup screens (e.g. /build-crm.html) stay
// reachable — the real app still links to them until each is ported.
const MOCKUP_FRONT_DOORS = new Set(["/", "/build-home.html"]);

export function getWorkspaceAccessDecision(input: WorkspaceAccessDecisionInput): WorkspaceAccessDecision {
  // Accepting an invite is public: reachable signed-out (create an account that
  // joins the workspace) and signed-in without a workspace (accept to get one).
  // The page itself branches on the session, so allow every state here.
  if (input.pathname === "/accept-invite" || input.pathname.startsWith("/accept-invite/")) {
    return { action: "allow" };
  }
  if (!input.isSignedIn) return { action: "login" };
  if (input.hasWorkspace) {
    // Signed-in member hitting the static front door → send them into the app.
    if (MOCKUP_FRONT_DOORS.has(input.pathname)) return { action: "app" };
    return { action: "allow" };
  }
  if (input.pathname === "/onboarding" || input.pathname.startsWith("/onboarding/")) return { action: "allow" };
  return { action: "onboarding" };
}

const STATIC_ASSET_RE = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|map|json|txt|xml|webmanifest)$/i;

/**
 * Which paths bypass the auth gate. The deployed front door is the static Arc
 * mockup served from `public/`: `/` rewrites to build-home.html, the screens are
 * reached directly as `/build-*.html`, and their scripts/styles are `/gallery-*`.
 *
 * - Static assets (`/gallery-*` and anything with an asset extension) are ALWAYS
 *   public, so the login screen and the mockup can render their styles/scripts.
 * - In open / operator mode the whole gallery — including `/` and the app screens
 *   — stays public (the current no-login demo).
 * - In supabase mode NOTHING here is public: `/`, build-home, every `/build-*`
 *   screen and the real app routes all require a signed-in member. An
 *   unauthenticated visitor is therefore sent to the standalone `/login` page
 *   (the auth pages themselves — /login, /sign-up, /forgot-password,
 *   /reset-password — are exempted by the proxy matcher, not here). This is what
 *   makes the app "start on the login screen" rather than showing the mockup with
 *   login awkwardly embedded in the shell's crossfade iframe.
 *
 * Pure + edge-safe so `proxy.ts` can call it and it can be unit-tested.
 */
export function isPublicMockupPath(pathname: string, authMode: AuthMode): boolean {
  if (pathname.startsWith("/gallery-") || STATIC_ASSET_RE.test(pathname)) return true;
  if (authMode !== "supabase") {
    return pathname === "/" || pathname === "/build-home.html" || pathname.startsWith("/build-");
  }
  return false;
}
