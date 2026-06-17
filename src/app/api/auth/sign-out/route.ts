import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { OPERATOR_COOKIE } from "@/lib/auth/operator-shared";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const authMode = getAuthMode();

  if (authMode === "supabase") {
    const supabase = await createSupabaseAuthServerClient();
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL(authMode === "open" ? "/" : "/login", origin), { status: 303 });
  response.cookies.set(OPERATOR_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
