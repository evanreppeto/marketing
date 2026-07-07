import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/workspace-invites", () => ({
  issueWorkspaceInviteCode: vi.fn(),
  cancelWorkspaceInvite: vi.fn(),
  lookupWorkspaceInviteByCode: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ resolveBrandEmailTheme: vi.fn(), sendBrandedEmail: vi.fn() }));
import { issueWorkspaceInviteCode, lookupWorkspaceInviteByCode } from "@/lib/auth/workspace-invites";
import { resolveBrandEmailTheme, sendBrandedEmail } from "@/lib/email";
import { POST } from "./route";

const issue = vi.mocked(issueWorkspaceInviteCode);
const lookup = vi.mocked(lookupWorkspaceInviteByCode);
const theme = vi.mocked(resolveBrandEmailTheme);
const send = vi.mocked(sendBrandedEmail);

function req(body: unknown) {
  return new Request("https://app.example.com/api/auth/workspace-invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  issue.mockReset();
  lookup.mockReset();
  theme.mockReset();
  send.mockReset();
  issue.mockResolvedValue({ ok: true, code: "ABC123", expiresAt: "2026-07-01T00:00:00Z" } as never);
  lookup.mockResolvedValue({
    ok: true,
    workspaceName: "Summit HQ",
    orgName: "Summit",
    role: "member",
    invitedEmail: "teammate@co.com",
    inviterName: "Riley Chen",
    expiresAt: "2026-07-01T00:00:00Z",
  } as never);
  theme.mockResolvedValue({ appName: "Summit", accentColor: "#0B0B0C" });
  send.mockResolvedValue({ ok: true, id: "msg_1" });
});

describe("POST /api/auth/workspace-invites email send", () => {
  it("emails a branded invite that links to the accept-invite screen", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "teammate@co.com" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "teammate@co.com",
        subject: "You're invited to join Summit HQ",
        cta: { label: "Accept invitation", url: "https://app.example.com/accept-invite/ABC123" },
      }),
    );
    expect(await res.json()).toMatchObject({
      ok: true,
      code: "ABC123",
      emailed: true,
      acceptUrl: "https://app.example.com/accept-invite/ABC123",
    });
  });

  it("does NOT email when no invitedEmail (code-only invite)", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member" }));
    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123" });
  });

  it("still emails (falling back to the app name) when invite details can't be resolved", async () => {
    lookup.mockResolvedValue({ ok: false, reason: "not_found" } as never);
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "x@co.com" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "You're invited to join Summit",
        cta: { label: "Accept invitation", url: "https://app.example.com/accept-invite/ABC123" },
      }),
    );
    expect(await res.json()).toMatchObject({ ok: true, emailed: true });
  });

  it("returns ok+code with emailed:false when the branded send fails", async () => {
    send.mockResolvedValue({ ok: false, error: "Resend 422" });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      code: "ABC123",
      emailed: false,
      emailError: "Resend 422",
      acceptUrl: "https://app.example.com/accept-invite/ABC123",
    });
  });

  it("returns ok+code with emailed:false when sending throws", async () => {
    send.mockRejectedValue(new Error("network error"));
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "network error" });
  });

  it("does not email when issuing the code failed", async () => {
    issue.mockResolvedValue({ ok: false, status: "invalid_input", message: "bad" } as never);
    const res = await POST(req({ workspaceId: "", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
