import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthMode: vi.fn(),
  getSupabaseAuthenticatedUser: vi.fn(),
  createWorkspaceForAuthenticatedUser: vi.fn(),
  redeemWorkspaceInviteCodeForUser: vi.fn(),
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth/auth-mode", () => ({ getAuthMode: mocks.getAuthMode }));
vi.mock("@/lib/auth/operator-shared", () => ({
  getSafeOperatorReturnPath: (p: string) => (p.startsWith("/") ? p : "/"),
}));
vi.mock("@/lib/auth/user-provisioning", () => ({
  redeemWorkspaceInviteCodeForUser: mocks.redeemWorkspaceInviteCodeForUser,
}));
vi.mock("@/lib/auth/workspace-onboarding", () => ({
  createWorkspaceForAuthenticatedUser: mocks.createWorkspaceForAuthenticatedUser,
}));
vi.mock("@/lib/supabase/auth-server", () => ({ getSupabaseAuthenticatedUser: mocks.getSupabaseAuthenticatedUser }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: mocks.getSupabaseAdminClient }));

import { POST } from "./route";

function post(fields: Record<string, string>) {
  return POST(
    new Request("http://localhost/api/auth/onboarding", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  );
}

function location(res: Response) {
  return res.headers.get("location") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthMode.mockReturnValue("supabase");
  mocks.getSupabaseAuthenticatedUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
});

describe("POST /api/auth/onboarding", () => {
  it("passes through to `from` when not in supabase mode", async () => {
    mocks.getAuthMode.mockReturnValue("open");
    const res = await post({ from: "/campaigns" });
    expect(res.status).toBe(303);
    expect(location(res)).toContain("/campaigns");
    expect(mocks.createWorkspaceForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("redirects to /login when not signed in", async () => {
    mocks.getSupabaseAuthenticatedUser.mockResolvedValue(null);
    const res = await post({ action: "create", from: "/build-crm" });
    expect(location(res)).toContain("/login");
  });

  it("creates a workspace and lands on `from`", async () => {
    mocks.createWorkspaceForAuthenticatedUser.mockResolvedValue({ ok: true, orgId: "o", workspaceId: "w", claimedExistingOrg: false });
    const res = await post({ action: "create", organizationName: "Acme", from: "/build-crm" });
    expect(mocks.createWorkspaceForAuthenticatedUser).toHaveBeenCalledWith({
      organizationName: "Acme",
      workspaceName: "",
      workspaceType: "company",
    });
    expect(location(res)).toContain("/build-crm");
  });

  it("surfaces a create error on /onboarding", async () => {
    mocks.createWorkspaceForAuthenticatedUser.mockResolvedValue({ ok: false, status: "invalid_input", message: "x" });
    const res = await post({ action: "create", from: "/build-crm" });
    expect(location(res)).toContain("/onboarding");
    expect(location(res)).toContain("error=invalid_input");
  });

  it("redirects a not_authenticated create result to /login", async () => {
    mocks.createWorkspaceForAuthenticatedUser.mockResolvedValue({ ok: false, status: "not_authenticated", message: "x" });
    const res = await post({ action: "create", from: "/build-crm" });
    expect(location(res)).toContain("/login");
  });

  it("joins via invite code and lands on `from`", async () => {
    mocks.redeemWorkspaceInviteCodeForUser.mockResolvedValue({ ok: true, status: "invited_member", orgId: "o", workspaceId: "w" });
    const res = await post({ action: "join", inviteCode: "ABC123", from: "/build-campaigns" });
    expect(mocks.redeemWorkspaceInviteCodeForUser).toHaveBeenCalled();
    expect(location(res)).toContain("/build-campaigns");
  });

  it("surfaces a join error with a join_ prefix", async () => {
    mocks.redeemWorkspaceInviteCodeForUser.mockResolvedValue({ ok: false, status: "not_found", message: "x" });
    const res = await post({ action: "join", inviteCode: "BAD", from: "/build-crm" });
    expect(location(res)).toContain("/onboarding");
    expect(location(res)).toContain("error=join_not_found");
  });
});
