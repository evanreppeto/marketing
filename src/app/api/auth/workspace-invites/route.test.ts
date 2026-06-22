import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/workspace-invites", () => ({ issueWorkspaceInviteCode: vi.fn(), cancelWorkspaceInvite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn() }));
import { issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

const issue = vi.mocked(issueWorkspaceInviteCode);
const adminFor = vi.mocked(getSupabaseAdminClient);
const inviteUserByEmail = vi.fn();
function req(body: unknown) {
  return new Request("https://app.example.com/api/auth/workspace-invites", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  issue.mockReset(); inviteUserByEmail.mockReset();
  issue.mockResolvedValue({ ok: true, code: "ABC123", expiresAt: "2026-07-01T00:00:00Z" } as never);
  inviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  adminFor.mockReturnValue({ auth: { admin: { inviteUserByEmail } } } as never);
});

describe("POST /api/auth/workspace-invites email send", () => {
  it("emails the invite (seeding pending_invite_code) when invitedEmail is given", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "teammate@co.com" }));
    expect(inviteUserByEmail).toHaveBeenCalledWith("teammate@co.com", {
      data: { pending_invite_code: "ABC123" },
      redirectTo: "https://app.example.com/auth/confirm",
    });
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: true });
  });
  it("does NOT email when no invitedEmail (code-only)", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member" }));
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123" });
  });
  it("still returns ok+code with emailed:false when the send errors", async () => {
    inviteUserByEmail.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "dup@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "already registered" });
  });
  it("does not email when issuing the code failed", async () => {
    issue.mockResolvedValue({ ok: false, status: "invalid_input", message: "bad" } as never);
    const res = await POST(req({ workspaceId: "", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(400);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
