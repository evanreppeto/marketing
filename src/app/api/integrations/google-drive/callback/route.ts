import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { recordConnectionTest } from "@/lib/connections/persistence";
import { saveGoogleDriveConnection } from "@/lib/google-drive/connection";
import { exchangeGoogleDriveCode, resolveGoogleDriveConfig } from "@/lib/google-drive/oauth";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const STATE_COOKIE = "arc_google_drive_oauth_state";

function redirectToLibrary(origin: string, status: string, detail?: string) {
  const url = new URL("/library", origin);
  url.searchParams.set("googleDrive", status);
  if (detail) url.searchParams.set("detail", detail);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: Request) {
  await requireOperator();

  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code || !state || state !== expectedState) {
    return redirectToLibrary(origin, "error", "state");
  }
  if (!isSupabaseAdminConfigured()) {
    return redirectToLibrary(origin, "error", "supabase");
  }

  const config = resolveGoogleDriveConfig(process.env, origin);
  if (!config.ok) {
    return redirectToLibrary(origin, "error", "env");
  }

  const client = getSupabaseAdminClient();
  try {
    const tokenSet = await exchangeGoogleDriveCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const orgId = await getCurrentOrgId();
    await saveGoogleDriveConnection({ orgId, connectedBy: await getOperatorActor(), tokenSet, client });
    await recordConnectionTest(client, "google_drive", { ok: true });
    return redirectToLibrary(origin, "connected");
  } catch (error) {
    await recordConnectionTest(client, "google_drive", {
      ok: false,
      error: error instanceof Error ? error.message : "Google Drive OAuth failed.",
    }).catch(() => undefined);
    return redirectToLibrary(origin, "error", error instanceof Error ? error.message : "oauth");
  }
}
