import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace-invites", () => ({
  removeWorkspaceMember: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
}));

import { removeWorkspaceMember, updateWorkspaceMemberRole } from "@/lib/auth/workspace-invites";

import { DELETE, PATCH } from "./route";

const removeWorkspaceMemberMock = vi.mocked(removeWorkspaceMember);
const updateWorkspaceMemberRoleMock = vi.mocked(updateWorkspaceMemberRole);

beforeEach(() => {
  removeWorkspaceMemberMock.mockReset();
  updateWorkspaceMemberRoleMock.mockReset();
});

describe("PATCH /api/auth/workspace-members", () => {
  it("updates a workspace member role from JSON input", async () => {
    updateWorkspaceMemberRoleMock.mockResolvedValue({ ok: true, role: "reviewer" });

    const response = await PATCH(
      new Request("http://localhost/api/auth/workspace-members", {
        body: JSON.stringify({
          memberId: "member-1",
          role: "reviewer",
          workspaceId: "workspace-1",
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    );

    expect(updateWorkspaceMemberRoleMock).toHaveBeenCalledWith({
      memberId: "member-1",
      role: "reviewer",
      workspaceId: "workspace-1",
    });
    await expect(response.json()).resolves.toEqual({ ok: true, role: "reviewer" });
  });

  it("maps member role failures to HTTP status codes", async () => {
    updateWorkspaceMemberRoleMock.mockResolvedValue({
      ok: false,
      status: "not_authorized",
      message: "Only workspace owners and admins can change member roles.",
    });

    const response = await PATCH(
      new Request("http://localhost/api/auth/workspace-members", {
        body: JSON.stringify({ memberId: "member-1", role: "admin", workspaceId: "workspace-1" }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/auth/workspace-members", () => {
  it("removes a workspace member from JSON input", async () => {
    removeWorkspaceMemberMock.mockResolvedValue({ ok: true });

    const response = await DELETE(
      new Request("http://localhost/api/auth/workspace-members", {
        body: JSON.stringify({
          memberId: "member-1",
          workspaceId: "workspace-1",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    );

    expect(removeWorkspaceMemberMock).toHaveBeenCalledWith({
      memberId: "member-1",
      workspaceId: "workspace-1",
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
