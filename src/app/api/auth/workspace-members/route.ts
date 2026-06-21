import { NextResponse } from "next/server";

import { removeWorkspaceMember, updateWorkspaceMemberRole } from "@/lib/auth/workspace-invites";

function statusCodeFor(status: string) {
  if (status === "not_authenticated") return 401;
  if (status === "not_authorized") return 403;
  if (status === "invalid_input") return 400;
  if (status === "not_configured") return 503;
  return 500;
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request) {
  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ ok: false, status: "invalid_input", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await updateWorkspaceMemberRole({
    memberId: typeof body.memberId === "string" ? body.memberId : "",
    role: typeof body.role === "string" ? body.role : "",
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: statusCodeFor(result.status) });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ ok: false, status: "invalid_input", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await removeWorkspaceMember({
    memberId: typeof body.memberId === "string" ? body.memberId : "",
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: statusCodeFor(result.status) });
  }

  return NextResponse.json(result);
}
