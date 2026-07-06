import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories below can reference them.
const mocks = vi.hoisted(() => ({
  getAuthMode: vi.fn(),
  getCurrentOrgId: vi.fn(),
  createSupabaseAuthServerClient: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/auth-mode", () => ({ getAuthMode: mocks.getAuthMode }));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: mocks.getCurrentOrgId }));
vi.mock("./auth-server", () => ({ createSupabaseAuthServerClient: mocks.createSupabaseAuthServerClient }));
vi.mock("./server", () => ({ getSupabaseAdminClient: mocks.getSupabaseAdminClient }));

import { resolveTenantReadHandle } from "./tenant-client";

const ADMIN_CLIENT = { __kind: "admin" };

function sessionClientWith(userResult: unknown) {
  return { __kind: "session", auth: { getUser: vi.fn().mockResolvedValue(userResult) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentOrgId.mockResolvedValue("org-active");
  mocks.getSupabaseAdminClient.mockReturnValue(ADMIN_CLIENT);
});

describe("resolveTenantReadHandle", () => {
  it("uses the user session client (RLS) when supabase mode has a live session", async () => {
    mocks.getAuthMode.mockReturnValue("supabase");
    const sessionClient = sessionClientWith({ data: { user: { id: "user-1" } }, error: null });
    mocks.createSupabaseAuthServerClient.mockResolvedValue(sessionClient);

    const handle = await resolveTenantReadHandle();

    // Returns the session client so RLS enforces org isolation in the DB...
    expect(handle.client).toBe(sessionClient);
    // ...and still pins to the active workspace org.
    expect(handle.orgId).toBe("org-active");
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("falls back to the admin client when supabase mode has no signed-in user", async () => {
    mocks.getAuthMode.mockReturnValue("supabase");
    mocks.createSupabaseAuthServerClient.mockResolvedValue(sessionClientWith({ data: { user: null }, error: null }));

    const handle = await resolveTenantReadHandle();

    expect(handle.client).toBe(ADMIN_CLIENT);
    expect(handle.orgId).toBe("org-active");
  });

  it("falls back to the admin client when getUser returns an error", async () => {
    mocks.getAuthMode.mockReturnValue("supabase");
    mocks.createSupabaseAuthServerClient.mockResolvedValue(
      sessionClientWith({ data: { user: { id: "user-1" } }, error: { message: "jwt expired" } }),
    );

    const handle = await resolveTenantReadHandle();

    expect(handle.client).toBe(ADMIN_CLIENT);
  });

  it("degrades to the admin client when the session client cannot be built (no request scope)", async () => {
    mocks.getAuthMode.mockReturnValue("supabase");
    mocks.createSupabaseAuthServerClient.mockRejectedValue(new Error("cookies() outside a request scope"));

    const handle = await resolveTenantReadHandle();

    expect(handle.client).toBe(ADMIN_CLIENT);
    expect(handle.orgId).toBe("org-active");
  });

  it("uses the admin client and never builds a session client in open mode", async () => {
    mocks.getAuthMode.mockReturnValue("open");

    const handle = await resolveTenantReadHandle();

    expect(handle.client).toBe(ADMIN_CLIENT);
    expect(handle.orgId).toBe("org-active");
    expect(mocks.createSupabaseAuthServerClient).not.toHaveBeenCalled();
  });

  it("uses the admin client in operator mode", async () => {
    mocks.getAuthMode.mockReturnValue("operator");

    const handle = await resolveTenantReadHandle();

    expect(handle.client).toBe(ADMIN_CLIENT);
    expect(mocks.createSupabaseAuthServerClient).not.toHaveBeenCalled();
  });
});
