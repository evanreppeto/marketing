import { NextResponse } from "next/server";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeOperatorReturnPath(url.searchParams.get("next") ?? "/");

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
    if (!provisioned.ok) {
      return NextResponse.redirect(
        new URL(`/login?error=provision&from=${encodeURIComponent(next)}`, url.origin),
        { status: 303 },
      );
    }
    if (provisioned.status === "profile_only") {
      return NextResponse.redirect(
        new URL(`/onboarding?from=${encodeURIComponent(next)}`, url.origin),
        { status: 303 },
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
