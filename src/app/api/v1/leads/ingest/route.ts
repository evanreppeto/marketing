import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { getCurrentOrgId } from "@/lib/auth/org";
import { parseLeadIngestionPayload } from "@/domain";
import { persistLeadIngestion } from "@/lib/lead-ingestion/persistence";
import { persistPersonaIntelligenceForLead } from "@/lib/persona-intelligence/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // Enforced only when LEADS_INGEST_API_TOKEN is set, so the documented dev/contract
  // flow keeps working while any configured deployment requires a valid token.
  const auth = checkBearerToken(request, "LEADS_INGEST_API_TOKEN", { required: false });

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "unauthorized",
        errors: [{ code: "unauthorized", message: "Lead ingestion requires a valid bearer token." }],
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

  const result = parseLeadIngestionPayload(payload);

  if (!result.ok) {
    return NextResponse.json(result, { status: result.httpStatus });
  }

  const { normalizedInput, ...responseResult } = result;

  if (!isSupabaseAdminConfigured()) {
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

    return NextResponse.json(
      {
        ...responseResult,
        persistence: {
          status: "persisted",
          ...persisted,
          personaIntelligence,
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
