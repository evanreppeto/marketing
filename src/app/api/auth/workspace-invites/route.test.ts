import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace-invites", () => ({ cancelWorkspaceInvite: vi.fn(), issueWorkspaceInviteCode: vi.fn() }));

import { cancelWorkspaceInvite, issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";

import { DELETE, POST } from "./route";

const issueWorkspaceInviteCodeMock = vi.mocked(issueWorkspaceInviteCode);
const cancelWorkspaceInviteMock = vi.mocked(cancelWorkspaceInvite);

describe("POST /api/auth/workspace-invites", () => {
  it("issues a workspace invite code from JSON input", async () => {
    issueWorkspaceInviteCodeMock.mockResolvedValue({
      code: "BSR7-K2M9",
      expiresAt: "2026-07-02T00:00:00.000Z",
      ok: true,
      orgId: "org-1",
      workspaceId: "workspace-1",
    });

    const response = await POST(
      new Request("http://localhost/api/auth/workspace-invites", {
        body: JSON.stringify({
          invitedEmail: "teammate@example.com",
          role: "marketer",
          workspaceId: "workspace-1",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(issueWorkspaceInviteCodeMock).toHaveBeenCalledWith({
      expiresInDays: undefined,
      invitedEmail: "teammate@example.com",
      role: "marketer",
      workspaceId: "workspace-1",
    });
    await expect(response.json()).resolves.toEqual({
      code: "BSR7-K2M9",
      expiresAt: "2026-07-02T00:00:00.000Z",
      ok: true,
      orgId: "org-1",
      workspaceId: "workspace-1",
    });
  });

  it("revokes a workspace invite from JSON input", async () => {
    cancelWorkspaceInviteMock.mockResolvedValue({ ok: true });

    const response = await DELETE(
      new Request("http://localhost/api/auth/workspace-invites", {
        body: JSON.stringify({
          inviteId: "invite-1",
          workspaceId: "workspace-1",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    );

    expect(cancelWorkspaceInviteMock).toHaveBeenCalledWith({
      inviteId: "invite-1",
      workspaceId: "workspace-1",
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
