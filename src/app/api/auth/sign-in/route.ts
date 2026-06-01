import { NextResponse } from "next/server";

import {
  OPERATOR_COOKIE,
  getConfiguredOperatorCredentials,
  getConfiguredOperatorToken,
  getSafeOperatorReturnPath,
  isValidOperatorCredentials,
} from "@/lib/auth/operator-shared";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;

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
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return response;
}
