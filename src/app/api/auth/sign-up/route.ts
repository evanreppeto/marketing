import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { buildSignUpIntent } from "@/lib/auth/sign-up-intent";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const signUpIntent = buildSignUpIntent({
    fullName: String(form.get("fullName") ?? ""),
    organizationName: String(form.get("organizationName") ?? ""),
    workspaceIntent: String(form.get("workspaceIntent") ?? "create"),
    workspaceType: String(form.get("workspaceType") ?? "company"),
  });
  const origin = new URL(request.url).origin;

  if (getAuthMode() !== "supabase") {
    return NextResponse.redirect(
      new URL(`/sign-up?error=config&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  if (password.length < 8) {
    return NextResponse.redirect(
      new URL(`/sign-up?error=password&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  if (!signUpIntent.ok) {
    return NextResponse.redirect(
      new URL(`/sign-up?error=${signUpIntent.error}&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  const supabase = await createSupabaseAuthServerClient();
  const emailRedirectTo = new URL("/auth/callback", origin);
  emailRedirectTo.searchParams.set("next", from);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: signUpIntent.metadata,
      emailRedirectTo: emailRedirectTo.toString(),
    },
  });

  if (error) {
    const normalizedMessage = error.message.toLowerCase();
    const errorCode =
      normalizedMessage.includes("already") || normalizedMessage.includes("registered")
        ? "exists"
        : "1";

    return NextResponse.redirect(
      new URL(`/sign-up?error=${errorCode}&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  if (data.user) {
    const provisioned = await provisionAuthenticatedUser(data.user);
    if (!provisioned.ok) {
      return NextResponse.redirect(
        new URL(`/sign-up?error=provision&from=${encodeURIComponent(from)}`, origin),
        { status: 303 },
      );
    }

    if (data.session && provisioned.status === "profile_only") {
      return NextResponse.redirect(
        new URL(`/onboarding?from=${encodeURIComponent(from)}`, origin),
        { status: 303 },
      );
    }
  }

  const success = data.session ? "created" : "check_email";
  return NextResponse.redirect(
    new URL(`/sign-up?success=${success}&from=${encodeURIComponent(from)}`, origin),
    { status: 303 },
  );
}
