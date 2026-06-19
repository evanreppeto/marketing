import { NextResponse } from "next/server";

import { cancelWorkspaceInvite, issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";

function statusCodeFor(status: string) {
  if (status === "not_authenticated") return 401;
  if (status === "not_authorized") return 403;
  if (status === "invalid_input") return 400;
  if (status === "not_configured") return 503;
  return 500;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "invalid_input", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await issueWorkspaceInviteCode({
    expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : undefined,
    invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : undefined,
    role: typeof body.role === "string" ? body.role : undefined,
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: statusCodeFor(result.status) });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "invalid_input", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await cancelWorkspaceInvite({
    inviteId: typeof body.inviteId === "string" ? body.inviteId : "",
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: statusCodeFor(result.status) });
  }

  return NextResponse.json(result);
}
