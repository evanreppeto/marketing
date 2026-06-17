import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthMode, getSupabaseAnonKey, getSupabaseAuthUrl } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
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
    user: error ? null : data.user,
  };
}

function redirectToLogin(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("from", getSafeOperatorReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const authMode = getAuthMode();

  // Gate disabled (no token configured): let everything through.
  if (authMode === "open") {
    return NextResponse.next();
  }

  if (authMode === "supabase") {
    const { response, user } = await getSupabaseProxySession(request);

    if (user) {
      return response;
    }

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
  matcher: ["/((?!api|auth/callback|_next/static|_next/image|login|sign-in|sign-up|forgot-password|favicon.ico|brand).*)"],
};
