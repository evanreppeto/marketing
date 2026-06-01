import { NextResponse } from "next/server";

import { OPERATOR_COOKIE } from "@/lib/auth/operator";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/login", origin), { status: 303 });
  response.cookies.set(OPERATOR_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
