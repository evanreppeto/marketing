import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/user-provisioning", () => ({ provisionAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/auth-server", () => ({ createSupabaseAuthServerClient: vi.fn() }));

import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

import { GET } from "./route";

const provisionAuthenticatedUserMock = vi.mocked(provisionAuthenticatedUser);
const createSupabaseAuthServerClientMock = vi.mocked(createSupabaseAuthServerClient);
const verifyOtpMock = vi.fn();
const exchangeCodeForSessionMock = vi.fn();

beforeEach(() => {
  provisionAuthenticatedUserMock.mockReset();
  createSupabaseAuthServerClientMock.mockReset();
  verifyOtpMock.mockReset();
  exchangeCodeForSessionMock.mockReset();

  createSupabaseAuthServerClientMock.mockResolvedValue({
    auth: { verifyOtp: verifyOtpMock, exchangeCodeForSession: exchangeCodeForSessionMock },
  } as unknown as Awaited<ReturnType<typeof createSupabaseAuthServerClient>>);
});

describe("GET /auth/confirm", () => {
  it("verifies an invite token and routes the new member to /welcome", async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "invited@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: true,
      status: "invited_member",
      orgId: "org-1",
      workspaceId: "ws-1",
    });

    const response = await GET(
      new Request("http://localhost/auth/confirm?token_hash=hash-1&type=invite&next=/arc"),
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({ type: "invite", token_hash: "hash-1" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/welcome?from=%2Farc");
  });

  it("exchanges a default-email ?code (no token_hash) and routes the member onward", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "invited@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: true,
      status: "invited_member",
      orgId: "org-1",
      workspaceId: "ws-1",
    });

    const response = await GET(new Request("http://localhost/auth/confirm?code=abc-123&next=/arc"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc-123");
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/welcome?from=%2Farc");
  });

  it("returns to login when neither a code nor a token is present", async () => {
    const response = await GET(new Request("http://localhost/auth/confirm?type=invite"));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=link&from=%2F");
  });

  it("returns to login when verification fails", async () => {
    verifyOtpMock.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });

    const response = await GET(
      new Request("http://localhost/auth/confirm?token_hash=hash-1&type=invite&next=/arc"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=link&from=%2Farc");
  });

  it("returns to login with a provision error when provisioning fails", async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "invited@example.com" } },
      error: null,
    });
    provisionAuthenticatedUserMock.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "User provisioning failed.",
    });

    const response = await GET(
      new Request("http://localhost/auth/confirm?token_hash=hash-1&type=invite&next=/"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=provision&from=%2F");
  });
});
