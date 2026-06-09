import { NextResponse } from "next/server";

import { bearerGuard } from "@/app/api/v1/hermes/_lib/http";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Liveness/connectivity check for the Mark Operations API. Bearer-gated, but
 * deliberately NOT Supabase-gated — health must answer even when the DB is
 * down; it reports DB readiness in the body instead.
 *
 *   GET /api/v1/hermes/health   Authorization: Bearer <HERMES_AGENT_API_TOKEN>
 */
export async function GET(request: Request) {
  const denied = bearerGuard(request);
  if (denied) return denied;

  return NextResponse.json(
    {
      ok: true,
      status: "ok",
      service: "bsr-marketing-hermes",
      supabaseConfigured: isSupabaseAdminConfigured(),
    },
    { status: 200 },
  );
}
