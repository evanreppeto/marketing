import { NextResponse, type NextRequest } from "next/server";

// Kept self-contained (no next/headers imports) so it stays proxy-safe.
const OPERATOR_COOKIE = "signal_operator";

export function proxy(request: NextRequest) {
  const token = process.env.OPERATOR_ACCESS_TOKEN;

  // Gate disabled (no token configured): let everything through.
  if (!token) {
    return NextResponse.next();
  }

  if (request.cookies.get(OPERATOR_COOKIE)?.value === token) {
    return NextResponse.next();
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect page routes only. Skip API routes (own bearer auth), Next internals,
  // auth pages themselves, and static/brand assets.
  matcher: ["/((?!api|_next/static|_next/image|login|sign-in|favicon.ico|brand).*)"],
};
