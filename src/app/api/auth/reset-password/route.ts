import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const origin = new URL(request.url).origin;

  if (getAuthMode() !== "supabase") {
    return NextResponse.redirect(new URL("/reset-password?error=config", origin), { status: 303 });
  }
  if (password.length < 8) {
    return NextResponse.redirect(new URL("/reset-password?error=password", origin), { status: 303 });
  }

  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The recovery link (via /auth/callback) establishes a session; without it the
  // link is invalid or expired.
  if (!user) {
    return NextResponse.redirect(new URL("/reset-password?error=expired", origin), { status: 303 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.redirect(new URL("/reset-password?error=1", origin), { status: 303 });
  }

  return NextResponse.redirect(new URL("/login?reset=1", origin), { status: 303 });
}
