import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/workspace-invites", () => ({ issueWorkspaceInviteCode: vi.fn(), cancelWorkspaceInvite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ resolveBrandEmailTheme: vi.fn(), sendBrandedEmail: vi.fn() }));
import { issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveBrandEmailTheme, sendBrandedEmail } from "@/lib/email";
import { POST } from "./route";

const issue = vi.mocked(issueWorkspaceInviteCode);
const adminFor = vi.mocked(getSupabaseAdminClient);
const theme = vi.mocked(resolveBrandEmailTheme);
const send = vi.mocked(sendBrandedEmail);
const generateLink = vi.fn();

function req(body: unknown) {
  return new Request("https://app.example.com/api/auth/workspace-invites", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  issue.mockReset(); generateLink.mockReset(); theme.mockReset(); send.mockReset();
  issue.mockResolvedValue({ ok: true, code: "ABC123", expiresAt: "2026-07-01T00:00:00Z" } as never);
  generateLink.mockResolvedValue({ data: { properties: { action_link: "https://app.example.com/auth/confirm?token_hash=t&type=invite" } }, error: null });
  adminFor.mockReturnValue({ auth: { admin: { generateLink } } } as never);
  theme.mockResolvedValue({ appName: "Summit", accentColor: "#0B0B0C" });
  send.mockResolvedValue({ ok: true, id: "msg_1" });
});

describe("POST /api/auth/workspace-invites email send", () => {
  it("generates an invite link and sends a branded email when invitedEmail is given", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "teammate@co.com" }));
    expect(generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "teammate@co.com",
      options: { redirectTo: "https://app.example.com/auth/confirm", data: { pending_invite_code: "ABC123" } },
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "teammate@co.com",
      cta: { label: "Accept invitation", url: "https://app.example.com/auth/confirm?token_hash=t&type=invite" },
    }));
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: true });
  });

  it("does NOT email when no invitedEmail (code-only)", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member" }));
    expect(generateLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123" });
  });

  it("returns ok+code with emailed:false when link generation errors", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "dup@co.com" }));
    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "already registered" });
  });

  it("returns ok+code with emailed:false when the branded send fails", async () => {
    send.mockResolvedValue({ ok: false, error: "Resend 422" });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "Resend 422" });
  });

  it("does not email when issuing the code failed", async () => {
    issue.mockResolvedValue({ ok: false, status: "invalid_input", message: "bad" } as never);
    const res = await POST(req({ workspaceId: "", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(400);
    expect(generateLink).not.toHaveBeenCalled();
  });
});
