import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const form = await request.formData();
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;

  if (getAuthMode() !== "supabase") {
    return NextResponse.redirect(
      new URL(`/login?error=oauth_config&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  const supabase = await createSupabaseAuthServerClient();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", from);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=oauth&from=${encodeURIComponent(from)}`, origin),
      { status: 303 },
    );
  }

  return NextResponse.redirect(data.url, { status: 303 });
}
