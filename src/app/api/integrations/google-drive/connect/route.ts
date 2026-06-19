import { randomUUID } from "crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { buildGoogleDriveAuthUrl, resolveGoogleDriveConfig } from "@/lib/google-drive/oauth";

const STATE_COOKIE = "arc_google_drive_oauth_state";

export async function GET(request: Request) {
  await requireOperator();

  const origin = new URL(request.url).origin;
  const config = resolveGoogleDriveConfig(process.env, origin);
  if (!config.ok) {
    return NextResponse.redirect(
      new URL(`/settings?section=connections&googleDrive=missing_env&missing=${encodeURIComponent(config.missing.join(","))}`, origin),
      { status: 303 },
    );
  }

  const state = randomUUID();
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: origin.startsWith("https://"),
  });

  return NextResponse.redirect(
    buildGoogleDriveAuthUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    }),
    { status: 303 },
  );
}
