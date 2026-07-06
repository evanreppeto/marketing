import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const origin = new URL(request.url).origin;

  if (getAuthMode() !== "supabase") {
    return NextResponse.redirect(new URL("/forgot-password?error=config", origin), { status: 303 });
  }

  // Fire the reset email. We deliberately ignore whether the address exists and
  // always show the same "check your email" result, so this can't be used to
  // probe which emails have accounts.
  if (email) {
    try {
      const supabase = await createSupabaseAuthServerClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
    } catch {
      // swallow — never reveal delivery/account state to the caller
    }
  }

  return NextResponse.redirect(new URL("/forgot-password?success=sent", origin), { status: 303 });
}
