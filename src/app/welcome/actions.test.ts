import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: vi.fn(async () => ({ auth: { getUser, updateUser } })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`); }) }));

import { completeInvitedAccountAction } from "./actions";

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("completeInvitedAccountAction", () => {
  it("rejects a short password (no updateUser)", async () => {
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "short", confirm: "short" }));
    expect(r).toMatchObject({ ok: false });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("rejects a mismatch", async () => {
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "longenough1", confirm: "different1" }));
    expect(r).toMatchObject({ ok: false });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("sets password + name then redirects home", async () => {
    await expect(completeInvitedAccountAction(null, fd({ fullName: "Ann Lee", password: "longenough1", confirm: "longenough1" })))
      .rejects.toThrow("REDIRECT:/");
    expect(updateUser).toHaveBeenCalledWith({ password: "longenough1", data: { full_name: "Ann Lee" } });
  });
  it("returns the error when updateUser fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "weak password" } });
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "longenough1", confirm: "longenough1" }));
    expect(r).toMatchObject({ ok: false, message: "weak password" });
  });
});
