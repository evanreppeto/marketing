import { NextResponse, type NextRequest } from "next/server";

import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isOperatorGateEnabled,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";

export function proxy(request: NextRequest) {
  // Gate disabled (no token configured): let everything through.
  if (!isOperatorGateEnabled()) {
    return NextResponse.next();
  }

  if (isValidOperatorValue(request.cookies.get(OPERATOR_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("from", getSafeOperatorReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

export const config = {
  // Protect page routes only. Skip API routes (own bearer auth), Next internals,
  // auth pages themselves, and static/brand assets.
  matcher: ["/((?!api|_next/static|_next/image|login|sign-in|favicon.ico|brand).*)"],
};
