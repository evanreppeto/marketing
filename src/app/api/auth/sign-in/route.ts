import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getConfiguredOperatorCredentials,
  getConfiguredOperatorToken,
  getSafeOperatorReturnPath,
  isValidOperatorCredentials,
} from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { SUPABASE_REMEMBER_COOKIE, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Persist the operator's "remember me" choice alongside the Supabase session.
 * Remembered → a 30-day cookie; not remembered → a session cookie that disappears
 * when the browser closes, mirroring the (now session-scoped) auth cookies.
 */
/**
 * Map a Supabase auth error to a specific login error code so the sign-in screen
 * can tell the operator what actually went wrong instead of one vague message.
 */
function signInErrorCode(error: { code?: string | null; status?: number } | null): string {
  const code = error?.code ?? "";
  if (code === "email_not_confirmed") return "unconfirmed";
  if (code.includes("rate_limit") || error?.status === 429) return "rate_limited";
  return "invalid";
}

function setRememberPreference(response: NextResponse, rememberMe: boolean) {
  response.cookies.set(SUPABASE_REMEMBER_COOKIE, rememberMe ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(rememberMe ? { maxAge: REMEMBER_MAX_AGE } : {}),
  });
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const rememberMe = form.get("rememberMe") === "1";
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;
  const authMode = getAuthMode();

  if (authMode === "supabase") {
    const supabase = await createSupabaseAuthServerClient({ rememberMe });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${signInErrorCode(error)}&from=${encodeURIComponent(from)}`, origin),
        { status: 303 },
      );
    }

    if (data.user) {
      const provisioned = await provisionAuthenticatedUser(data.user);
      if (!provisioned.ok) {
        return NextResponse.redirect(
          new URL(`/login?error=provision&from=${encodeURIComponent(from)}`, origin),
          { status: 303 },
        );
      }
      if (provisioned.status === "profile_only") {
        return setRememberPreference(
          NextResponse.redirect(new URL(`/onboarding?from=${encodeURIComponent(from)}`, origin), { status: 303 }),
          rememberMe,
        );
      }
    }

    return setRememberPreference(NextResponse.redirect(new URL(from, origin), { status: 303 }), rememberMe);
  }

  const configured = getConfiguredOperatorToken();

  if (!configured) {
    return NextResponse.redirect(new URL(from, origin), { status: 303 });
  }

  if (!getConfiguredOperatorCredentials()) {
    return NextResponse.redirect(
      new URL(`/login?error=config&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  if (!isValidOperatorCredentials(email, password)) {
    return NextResponse.redirect(
      new URL(`/login?error=1&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  const response = NextResponse.redirect(new URL(from, origin), { status: 303 });
  response.cookies.set(OPERATOR_COOKIE, configured, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 12,
  });
  return response;
}
