import { NextResponse } from "next/server";

import { OPERATOR_COOKIE } from "@/lib/auth/operator";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const fromRaw = String(form.get("from") ?? "/");
  const from = fromRaw.startsWith("/") && !fromRaw.startsWith("//") ? fromRaw : "/";
  const origin = new URL(request.url).origin;

  const configured = process.env.OPERATOR_ACCESS_TOKEN;

  if (!configured || token !== configured) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=1&from=${encodeURIComponent(from)}`, origin),
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
