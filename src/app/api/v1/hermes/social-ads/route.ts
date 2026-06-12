import { NextResponse } from "next/server";
import { z } from "zod";

import { checkAgentBearer } from "@/lib/auth/api-token";
import { runHermesSocialAd } from "@/lib/hermes/social-ad-orchestrator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN before enabling Hermes API runs." }
        : { ok: false, status: "unauthorized", message: "Hermes API runs require a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required before Hermes can persist work." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await runHermesSocialAd(payload);
    return NextResponse.json({ ok: true, status: result.status, result, outboundDispatchAllowed: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, status: "rejected", errors: error.issues.map((i) => ({ code: i.code, message: i.message, path: i.path.map(String) })) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Hermes social-ad run failed." },
      { status: 502 },
    );
  }
}
