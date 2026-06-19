import { NextResponse } from "next/server";
import { z } from "zod";

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { runArcPartnerCampaign } from "@/lib/arc/orchestrator";

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
    const result = await runArcPartnerCampaign(payload, undefined, undefined, tenant);

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
