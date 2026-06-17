import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
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

  const supabase = await createSupabaseAuthServerClient();
  const emailRedirectTo = new URL("/auth/callback", origin);
  emailRedirectTo.searchParams.set("next", from);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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

  const success = data.session ? "created" : "check_email";
  return NextResponse.redirect(
    new URL(`/sign-up?success=${success}&from=${encodeURIComponent(from)}`, origin),
    { status: 303 },
  );
}
