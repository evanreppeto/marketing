import { NextResponse } from "next/server";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorIntegrationKey, requireOperator } from "@/lib/auth/operator";
import { resolveGoogleDriveAccessToken } from "@/lib/google-drive/connection";
import { resolveGoogleDrivePickerConfig } from "@/lib/google-drive/oauth";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const picker = resolveGoogleDrivePickerConfig();
  if (!picker.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Google Drive Picker is missing: ${picker.missing.join(", ")}`,
        missing: picker.missing,
      },
      { status: 503 },
    );
  }

  try {
    const origin = new URL(request.url).origin;
    const orgId = await getCurrentOrgId();
    const operator = await getOperatorIntegrationKey();
    const accessToken = await resolveGoogleDriveAccessToken({ orgId, connectedBy: operator, origin });
    return NextResponse.json({
      ok: true,
      accessToken,
      apiKey: picker.apiKey,
      appId: picker.appId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive is not ready.";
    const status = message.includes("not connected") ? 409 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
