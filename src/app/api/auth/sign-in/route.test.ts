import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-mode", () => ({ getAuthMode: vi.fn() }));
vi.mock("@/lib/auth/user-provisioning", () => ({ provisionAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/auth-server", () => ({ createSupabaseAuthServerClient: vi.fn() }));

import { getAuthMode } from "@/lib/auth/auth-mode";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

import { POST } from "./route";

const getAuthModeMock = vi.mocked(getAuthMode);
const provisionAuthenticatedUserMock = vi.mocked(provisionAuthenticatedUser);
const createSupabaseAuthServerClientMock = vi.mocked(createSupabaseAuthServerClient);
const signInWithPasswordMock = vi.fn();

function signInRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request("http://localhost/api/auth/sign-in", {
    body: form,
    method: "POST",
  });
}

beforeEach(() => {
  getAuthModeMock.mockReset();
  provisionAuthenticatedUserMock.mockReset();
  createSupabaseAuthServerClientMock.mockReset();
  signInWithPasswordMock.mockReset();

  getAuthModeMock.mockReturnValue("supabase");
  createSupabaseAuthServerClientMock.mockResolvedValue({
    auth: { signInWithPassword: signInWithPasswordMock },
  } as unknown as Awaited<ReturnType<typeof createSupabaseAuthServerClient>>);
});

describe("POST /api/auth/sign-in", () => {
  it("sends signed-in users without workspace access to onboarding", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: true,
      status: "profile_only",
      orgId: null,
      workspaceId: null,
    });

    const response = await POST(
      signInRequest({
        email: "owner@example.com",
        from: "/arc",
        password: "strong-password",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/onboarding?from=%2Farc");
  });

  it("returns to login when backend provisioning fails after password sign-in", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "User provisioning failed.",
    });

    const response = await POST(
      signInRequest({
        email: "owner@example.com",
        from: "/campaigns",
        password: "strong-password",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=provision&from=%2Fcampaigns");
  });
});
