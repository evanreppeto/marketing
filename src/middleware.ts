import { NextResponse, type NextRequest } from "next/server";

// Kept self-contained (no next/headers imports) so it stays edge-safe.
const OPERATOR_COOKIE = "signal_operator";

export function middleware(request: NextRequest) {
  const token = process.env.OPERATOR_ACCESS_TOKEN;

  // Gate disabled (no token configured) → let everything through.
  if (!token) {
    return NextResponse.next();
  }

  if (request.cookies.get(OPERATOR_COOKIE)?.value === token) {
    return NextResponse.next();
  }

  const url = new URL("/sign-in", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect page routes only. Skip API routes (own bearer auth), Next internals,
  // the sign-in page itself, and static/brand assets.
  matcher: ["/((?!api|_next/static|_next/image|sign-in|favicon.ico|brand).*)"],
};
