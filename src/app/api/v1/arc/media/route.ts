import { NextResponse } from "next/server";

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Arc-facing read of approved media available to the agent.
 *   GET /api/v1/arc/media   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 *   200 -> { ok: true, assets: [...] }   401 -> bad token   503 -> not configured
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 });
  }
  const table: string = "media_assets";
  const { data, error } = await getSupabaseAdminClient()
    .from(table)
    .select("id, file_name, public_url, kind, source, provenance, risk_flags, tags, width, height")
    .eq("org_id", allowed.scope.orgId)
    .eq("available_to_arc", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, status: "error", message: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, assets: data ?? [] }, { status: 200 });
}
