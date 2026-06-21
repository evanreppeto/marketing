import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/user-provisioning", () => ({ provisionAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/auth-server", () => ({ createSupabaseAuthServerClient: vi.fn() }));

import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

import { GET } from "./route";

const provisionAuthenticatedUserMock = vi.mocked(provisionAuthenticatedUser);
const createSupabaseAuthServerClientMock = vi.mocked(createSupabaseAuthServerClient);
const exchangeCodeForSessionMock = vi.fn();

beforeEach(() => {
  provisionAuthenticatedUserMock.mockReset();
  createSupabaseAuthServerClientMock.mockReset();
  exchangeCodeForSessionMock.mockReset();

  createSupabaseAuthServerClientMock.mockResolvedValue({
    auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
  } as unknown as Awaited<ReturnType<typeof createSupabaseAuthServerClient>>);
});

describe("GET /auth/callback", () => {
  it("returns to login when OAuth provisioning fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "User provisioning failed.",
    });

    const response = await GET(new Request("http://localhost/auth/callback?code=abc&next=/arc"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=provision&from=%2Farc");
  });

  it("sends OAuth users without workspace access to onboarding", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: true,
      status: "profile_only",
      orgId: null,
      workspaceId: null,
    });

    const response = await GET(new Request("http://localhost/auth/callback?code=abc&next=/campaigns"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/onboarding?from=%2Fcampaigns");
  });
});
