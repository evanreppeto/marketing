import { NextResponse } from "next/server";

import { CampaignResultsValidationError, parseCampaignResultsPayload } from "@/domain";
import { checkBearerToken } from "@/lib/auth/api-token";
import { syncPerformanceForCampaigns } from "@/lib/brain-ingestion/sync";
import { persistCampaignResults } from "@/lib/gallery/results-persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const persistenceConfigured = isSupabaseAdminConfigured();
  const auth = checkBearerToken(request, "CAMPAIGN_RESULTS_API_TOKEN", { required: persistenceConfigured });
  if (!auth.ok) {
    const notConfigured = auth.reason === "not_configured";
    return NextResponse.json(
      {
        ok: false,
        status: notConfigured ? "not_configured" : "unauthorized",
        errors: [
          {
            code: notConfigured ? "not_configured" : "unauthorized",
            message: notConfigured
              ? "Set CAMPAIGN_RESULTS_API_TOKEN before enabling persistent campaign results ingestion."
              : "Campaign results ingest requires a valid bearer token.",
          },
        ],
      },
      { status: auth.status },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", errors: [{ code: "invalid_json", message: "Request body must be valid JSON." }] }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseCampaignResultsPayload(payload);
  } catch (error) {
    if (error instanceof CampaignResultsValidationError) {
      return NextResponse.json({ ok: false, status: "rejected", errors: [{ code: "validation_error", message: error.message }] }, { status: 400 });
    }
    throw error;
  }

  if (!persistenceConfigured) {
    return NextResponse.json(
      { ok: true, status: "accepted", received: parsed.length, persistence: { status: "not_configured", message: "Supabase persistence is not connected." } },
      { status: 202 },
    );
  }

  try {
    const client = getSupabaseAdminClient();
    const summary = await persistCampaignResults(parsed, client);
    // Mirror the just-ingested results into the Brain so Arc can recall what each
    // campaign did. Best-effort + awaited — a sync hiccup must not fail ingestion.
    await syncPerformanceForCampaigns(parsed.map((r) => r.campaign_id), { client }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "persisted", received: parsed.length, persistence: { status: "persisted", ...summary } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist campaign results.";
    return NextResponse.json({ ok: false, status: "failed", persistence: { status: "failed", message } }, { status: 502 });
  }
}
