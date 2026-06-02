import { NextResponse } from "next/server";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";

export async function POST(request: Request) {
  const form = await request.formData();
  const from = getSafeOperatorReturnPath(String(form.get("from") ?? "/"));
  const origin = new URL(request.url).origin;

  return NextResponse.redirect(
    new URL(`/login?error=passkey&from=${encodeURIComponent(from)}`, origin),
    { status: 303 },
  );
}
