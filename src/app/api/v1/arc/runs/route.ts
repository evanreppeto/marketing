import { NextResponse } from "next/server";
import { z } from "zod";

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { isAllowedPersona } from "@/domain";
import { parseArcPartnerCampaignRequest } from "@/lib/arc/contracts";
import { runArcPartnerCampaign } from "@/lib/arc/orchestrator";
import { getOrgPersonaKeys } from "@/lib/personas/read-model";

export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const tenant = { org_id: allowed.scope.orgId, workspace_id: allowed.scope.workspaceId };

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        message: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  try {
    // Parse here (applying the contract's defaults) so persona can be validated
    // against THIS workspace's taxonomy before any row is written. getOrgPersonaKeys
    // carries the legacy kebab↔persona_ bridge; an empty list (org defined none)
    // skips the gate rather than rejecting every persona.
    const request_ = parseArcPartnerCampaignRequest(payload);
    const allowedPersonas = await getOrgPersonaKeys(allowed.scope.orgId);
    if (allowedPersonas.length > 0 && !isAllowedPersona(request_.persona, allowedPersonas)) {
      return NextResponse.json(
        { ok: false, status: "rejected", message: `Unknown persona "${request_.persona}" for this workspace.` },
        { status: 400 },
      );
    }

    const result = await runArcPartnerCampaign(request_, undefined, undefined, tenant);

    return NextResponse.json(
      {
        ok: true,
        status: result.status,
        result,
        outboundDispatchAllowed: false,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          errors: error.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            path: issue.path.map(String),
          })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Arc run failed.",
      },
      { status: 502 },
    );
  }
}
