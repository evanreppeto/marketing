import { NextResponse } from "next/server";

import { bearerGuard } from "@/app/api/v1/arc/_lib/http";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Liveness/connectivity check for the Arc Operations API. Bearer-gated, but
 * deliberately NOT Supabase-gated — health must answer even when the DB is
 * down; it reports DB readiness in the body instead.
 *
 *   GET /api/v1/arc/health   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 */
export async function GET(request: Request) {
  const denied = await bearerGuard(request);
  if (denied) return denied;

  return NextResponse.json(
    {
      ok: true,
      status: "ok",
      service: "bsr-marketing-arc",
      supabaseConfigured: isSupabaseAdminConfigured(),
    },
    { status: 200 },
  );
}
