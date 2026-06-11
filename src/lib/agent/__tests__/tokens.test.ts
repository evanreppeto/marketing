import { describe, expect, it, vi } from "vitest";
import { hashToken, generateToken, verifyAgentToken } from "../tokens";

describe("token primitives", () => {
  it("hashes deterministically to 64 hex chars", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates an sk_live_ token whose hash/prefix match the plaintext", () => {
    const t = generateToken();
    expect(t.plaintext.startsWith("sk_live_")).toBe(true);
    expect(t.prefix).toBe(t.plaintext.slice(0, 12));
    expect(t.hash).toBe(hashToken(t.plaintext));
  });
});

describe("verifyAgentToken", () => {
  function fakeClient(row: { workspace_id: string } | null) {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    return {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
        update,
      }),
      _update: update,
    } as never;
  }

  it("returns the workspace for a known, non-revoked token", async () => {
    const res = await verifyAgentToken("sk_live_known", fakeClient({ workspace_id: "default" }));
    expect(res).toEqual({ ok: true, workspaceId: "default" });
  });

  it("returns not-ok for an unknown token", async () => {
    const res = await verifyAgentToken("sk_live_nope", fakeClient(null));
    expect(res.ok).toBe(false);
  });
});
