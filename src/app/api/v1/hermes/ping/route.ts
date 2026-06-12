import { NextResponse } from "next/server";

import { checkAgentBearer } from "@/lib/auth/api-token";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Connection test for the Hermes agent. Side-effect-free: it validates the
 * bearer token and reports whether the backend can persist, without creating
 * any records. Mark calls this to confirm reachability + auth before running
 * real campaign work.
 *
 *   GET /api/v1/hermes/ping   Authorization: Bearer <HERMES_AGENT_API_TOKEN>
 *
 *   200 -> { ok: true, status: "connected", supabaseConfigured }
 *   401 -> bad/missing token
 *   503 -> token not configured on this deployment
 */
export async function GET(request: Request) {
  const auth = await checkAgentBearer(request);

  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN on this deployment to enable Hermes." }
        : { ok: false, status: "unauthorized", message: "Hermes connection test requires a valid bearer token." },
      { status: auth.status },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: "connected",
      service: "hermes",
      supabaseConfigured: isSupabaseAdminConfigured(),
      time: new Date().toISOString(),
    },
    { status: 200 },
  );
}
