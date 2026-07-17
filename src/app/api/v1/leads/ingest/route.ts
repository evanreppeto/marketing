import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { TOKEN_SCOPE_LEADS_INGEST } from "@/lib/agent/tokens";
import { getAttributionSourceRules } from "@/lib/attribution/source-rules";
import { checkWorkspaceBearer } from "@/lib/auth/api-token";
import { getCurrentOrgId } from "@/lib/auth/org";
import { parseLeadIngestionPayload } from "@/domain";
import { stitchAnonymousToContact } from "@/lib/journey/persistence";
import { getOrgPersonaKeys } from "@/lib/personas/read-model";
import { persistLeadIngestion } from "@/lib/lead-ingestion/persistence";
import { persistPersonaIntelligenceForLead } from "@/lib/persona-intelligence/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const persistenceConfigured = isSupabaseAdminConfigured();
  // Non-persistent dev/contract mode stays open. Once Supabase persistence is
  // connected, ingestion must be authenticated before it can write data.
  const auth = await checkWorkspaceBearer(request, "LEADS_INGEST_API_TOKEN", {
    required: persistenceConfigured,
    scope: TOKEN_SCOPE_LEADS_INGEST,
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
              ? "Set LEADS_INGEST_API_TOKEN before enabling persistent lead ingestion."
              : "Lead ingestion requires a valid bearer token.",
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
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        errors: [
          {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        ],
      },
      { status: 400 },
    );
  }

  // A per-workspace token carries its own org, so the caller's workspace is a
  // fact. The legacy shared env token doesn't, so it falls back to the session /
  // default workspace — which is exactly why this endpoint could only ever serve
  // one tenant before scoped tokens existed.
  const tokenOrgId = auth.orgId;

  // Validate persona against the CALLER's taxonomy (not the default workspace's);
  // local no-Supabase mode keeps the built-in default so the dev contract holds.
  //
  // Attribution rules are the caller's too. They're what lets a lead that arrives
  // with a source but no utm/token ("Google Ads", a partner referral) resolve to a
  // campaign instead of `unattributed`, which is what the journey lens picker
  // divides credit by. Loaded per-org for the same reason as the personas: a
  // tenant's rules are not another tenant's, and a caller that can't name its org
  // (the legacy shared env token) gets none rather than the default workspace's.
  const [personaKeys, sourceRules] = persistenceConfigured
    ? await Promise.all([getOrgPersonaKeys(tokenOrgId), getAttributionSourceRules(tokenOrgId)])
    : [undefined, undefined];

  const result = persistenceConfigured
    ? parseLeadIngestionPayload(payload, undefined, personaKeys, sourceRules)
    : parseLeadIngestionPayload(payload);

  if (!result.ok) {
    return NextResponse.json(result, { status: result.httpStatus });
  }

  const { normalizedInput, ...responseResult } = result;

  if (!persistenceConfigured) {
    return NextResponse.json(
      {
        ...responseResult,
        persistence: {
          status: "not_configured",
          message: "Supabase persistence will be enabled after project environment variables are connected.",
        },
      },
      { status: 202 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const orgId = tokenOrgId ?? (await getCurrentOrgId());
    const persisted = await persistLeadIngestion({
      input: normalizedInput,
      result,
      supabase,
      orgId,
    });
    const personaIntelligence = await persistOptionalPersonaIntelligence({
      input: normalizedInput,
      result,
      persisted,
      supabase,
      orgId,
    });
    // Identity stitch (P1): if this lead carried an anonymous_id from a first-party
    // collector cookie, merge its pre-lead journey onto the now-known contact.
    // Best-effort — a stitch failure never fails a successful ingest.
    const journeyStitch = await maybeStitchAnonymousJourney(payload, persisted.contactId, supabase, orgId);

    return NextResponse.json(
      {
        ...responseResult,
        persistence: {
          status: "persisted",
          ...persisted,
          personaIntelligence,
          journeyStitch,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist lead ingestion.";

    return NextResponse.json(
      {
        ...responseResult,
        persistence: {
          status: "failed",
          message,
        },
      },
      { status: 502 },
    );
  }

}

/** Pull a collector anonymous_id off the raw ingest body, if a valid one is present. */
function extractAnonymousId(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "anonymousId" in payload) {
    const value = (payload as { anonymousId?: unknown }).anonymousId;
    if (typeof value === "string" && value.length >= 8 && value.length <= 128) return value;
  }
  return null;
}

async function maybeStitchAnonymousJourney(payload: unknown, contactId: string | null, supabase: SupabaseClient, orgId: string) {
  if (!contactId) return null;
  const anonymousId = extractAnonymousId(payload);
  if (!anonymousId) return null;
  try {
    return await stitchAnonymousToContact({ supabase, orgId, anonymousId, contactId });
  } catch {
    return null;
  }
}

type OptionalPersonaIntelligenceInput = Parameters<typeof persistPersonaIntelligenceForLead>[0];

async function persistOptionalPersonaIntelligence(input: OptionalPersonaIntelligenceInput) {
  try {
    return {
      status: "persisted" as const,
      ...(await persistPersonaIntelligenceForLead(input)),
    };
  } catch (error) {
    return {
      status: "not_ready" as const,
      message:
        error instanceof Error
          ? error.message
          : "Persona intelligence tables are not ready for persistence yet.",
    };
  }
}
