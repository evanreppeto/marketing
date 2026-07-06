import { type AuthMode } from "./auth-mode";

type WorkspaceAccessDecisionInput = {
  hasWorkspace: boolean;
  isSignedIn: boolean;
  pathname: string;
};

export type WorkspaceAccessDecision = { action: "allow" | "login" | "onboarding" };

export function getWorkspaceAccessDecision(input: WorkspaceAccessDecisionInput): WorkspaceAccessDecision {
  if (!input.isSignedIn) return { action: "login" };
  if (input.hasWorkspace) return { action: "allow" };
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
 *   public, so pages — including the sign-in screen and the landing — can render.
 * - The landing (`/` and build-home.html) is always public: a front door that
 *   exists before sign-in.
 * - In open / operator mode the whole gallery stays public (the current demo).
 * - In supabase mode the inner app screens (`/build-*.html`, plus real hydrated
 *   routes as they ship) sit behind the gate and require a signed-in member.
 *
 * Pure + edge-safe so `proxy.ts` can call it and it can be unit-tested.
 */
export function isPublicMockupPath(pathname: string, authMode: AuthMode): boolean {
  if (pathname.startsWith("/gallery-") || STATIC_ASSET_RE.test(pathname)) return true;
  if (pathname === "/" || pathname === "/build-home.html") return true;
  if (authMode !== "supabase") return pathname.startsWith("/build-");
  return false;
}
