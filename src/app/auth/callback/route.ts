import { NextResponse } from "next/server";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { authedRedirectLocation } from "@/lib/auth/post-auth-redirect";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeOperatorReturnPath(url.searchParams.get("next") ?? "/");

  // The provider can bounce back with an error instead of a code — most commonly
  // because the operator dismissed Google's consent screen. Distinguish that from
  // a genuine failure so the sign-in screen can say "cancelled" rather than "failed".
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const reason = oauthError === "access_denied" ? "oauth_cancelled" : "oauth";
    return NextResponse.redirect(
      new URL(`/login?error=${reason}&from=${encodeURIComponent(next)}`, url.origin),
      { status: 303 },
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=oauth&from=${encodeURIComponent(next)}`, url.origin),
      { status: 303 },
    );
  }

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=oauth&from=${encodeURIComponent(next)}`, url.origin),
      { status: 303 },
    );
  }

  if (data.user) {
    const provisioned = await provisionAuthenticatedUser(data.user);
    return NextResponse.redirect(authedRedirectLocation(provisioned, next, url.origin), { status: 303 });
  }

  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
