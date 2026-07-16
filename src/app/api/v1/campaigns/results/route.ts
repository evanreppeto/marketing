import { NextResponse } from "next/server";

import { CampaignResultsValidationError, parseCampaignResultsPayload } from "@/domain";
import { TOKEN_SCOPE_CAMPAIGN_RESULTS_INGEST } from "@/lib/agent/tokens";
import { checkWorkspaceBearer } from "@/lib/auth/api-token";
import { getCurrentOrgId } from "@/lib/auth/org";
import { syncPerformanceForCampaigns } from "@/lib/brain-ingestion/sync";
import { persistCampaignResults } from "@/lib/gallery/results-persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const persistenceConfigured = isSupabaseAdminConfigured();
  const auth = await checkWorkspaceBearer(request, "CAMPAIGN_RESULTS_API_TOKEN", {
    required: persistenceConfigured,
    scope: TOKEN_SCOPE_CAMPAIGN_RESULTS_INGEST,
  });
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
    // A per-workspace token carries its own org, so the caller's workspace is a
    // fact. The legacy shared env token doesn't, so it falls back to the session /
    // default workspace — which is why a shared token can only ever serve one tenant.
    const orgId = auth.orgId ?? (await getCurrentOrgId());
    const summary = await persistCampaignResults(parsed, client, orgId);
    // Mirror the just-ingested results into the Brain so Arc can recall what each
    // campaign did. Best-effort + awaited — a sync hiccup must not fail ingestion.
    await syncPerformanceForCampaigns(parsed.map((r) => r.campaign_id), { client }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "persisted", received: parsed.length, persistence: { status: "persisted", ...summary } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist campaign results.";
    return NextResponse.json({ ok: false, status: "failed", persistence: { status: "failed", message } }, { status: 502 });
  }
}
