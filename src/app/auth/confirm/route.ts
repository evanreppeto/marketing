import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { authedRedirectLocation } from "@/lib/auth/post-auth-redirect";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const EMAIL_OTP_TYPES: EmailOtpType[] = ["invite", "magiclink", "recovery", "email", "email_change", "signup"];

function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && (EMAIL_OTP_TYPES as string[]).includes(value) ? (value as EmailOtpType) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = parseEmailOtpType(url.searchParams.get("type"));
  const next = getSafeOperatorReturnPath(url.searchParams.get("next") ?? "/");

  const loginWith = (error: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${error}&from=${encodeURIComponent(next)}`, url.origin),
      { status: 303 },
    );

  // Email links arrive in two shapes: the default Supabase template sends a `?code`
  // (exchanged for a session), while a customized template sends `token_hash`+`type`
  // (verified via OTP). Support both so invites work whether or not the template has
  // been customized (template editing requires custom SMTP).
  if (!code && (!tokenHash || !type)) {
    return loginWith("link");
  }

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });

  if (error || !data.user) {
    return loginWith("link");
  }

  const provisioned = await provisionAuthenticatedUser(data.user);
  return NextResponse.redirect(authedRedirectLocation(provisioned, next, url.origin), { status: 303 });
}
