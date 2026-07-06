import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthMode, getSupabaseAnonKey, getSupabaseAuthUrl } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { getWorkspaceAccessDecision } from "@/lib/auth/route-protection";
import { type Database } from "@/lib/supabase/database.types";

async function getSupabaseProxySession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(getSupabaseAuthUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  return {
    response,
    supabase,
    user: error ? null : data.user,
  };
}

async function hasActiveWorkspaceMembership(supabase: Awaited<ReturnType<typeof createServerClient<Database>>>, userId: string) {
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

function redirectToLogin(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("from", getSafeOperatorReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

function redirectToOnboarding(request: NextRequest) {
  const url = new URL("/onboarding", request.url);
  url.searchParams.set("from", getSafeOperatorReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

// Static Arc mockup gallery served from `public/` (the current "main app").
// These screens carry no real data and intentionally sit outside the auth
// gate, so they stay reachable regardless of auth mode — no sign-in required.
function isPublicMockupPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/build-") ||
    pathname.startsWith("/gallery-")
  );
}

export async function proxy(request: NextRequest) {
  const authMode = getAuthMode();

  if (isPublicMockupPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Gate disabled (no token configured): let everything through.
  if (authMode === "open") {
    return NextResponse.next();
  }

  if (authMode === "supabase") {
    const { response, supabase, user } = await getSupabaseProxySession(request);
    const hasWorkspace = user ? await hasActiveWorkspaceMembership(supabase, user.id) : false;
    const decision = getWorkspaceAccessDecision({
      hasWorkspace,
      isSignedIn: Boolean(user),
      pathname: request.nextUrl.pathname,
    });

    if (decision.action === "allow") return response;
    if (decision.action === "onboarding") return redirectToOnboarding(request);
    return redirectToLogin(request);
  }

  if (isValidOperatorValue(request.cookies.get(OPERATOR_COOKIE)?.value)) {
    return NextResponse.next();
  }

  return redirectToLogin(request);
}

export const config = {
  // Protect page routes only. Skip API routes (own bearer auth), Next internals,
  // auth pages themselves, and static/brand assets.
  matcher: ["/((?!api|auth/callback|_next/static|_next/image|login|sign-in|sign-up|forgot-password|reset-password|favicon.ico|icon.png|brand|effects).*)"],
};
