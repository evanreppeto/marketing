import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
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
  const auth = checkBearerToken(request, "LEADS_INGEST_API_TOKEN", { required: persistenceConfigured });

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

  // Validate persona against the org's own taxonomy when persisting; local
  // no-Supabase mode keeps the built-in default so the dev contract still holds.
  const result = persistenceConfigured
    ? parseLeadIngestionPayload(payload, undefined, await getOrgPersonaKeys())
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
    const orgId = await getCurrentOrgId();
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
