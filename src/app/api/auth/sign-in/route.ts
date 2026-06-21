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
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const rememberMe = form.get("rememberMe") === "1";
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;
  const authMode = getAuthMode();

  if (authMode === "supabase") {
    const supabase = await createSupabaseAuthServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=1&from=${encodeURIComponent(from)}`, origin),
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
        return NextResponse.redirect(
          new URL(`/onboarding?from=${encodeURIComponent(from)}`, origin),
          { status: 303 },
        );
      }
    }

    return NextResponse.redirect(new URL(from, origin), { status: 303 });
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
