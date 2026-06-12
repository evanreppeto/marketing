import { describe, expect, it, vi } from "vitest";

import { generateToken, hashToken, verifyAgentToken } from "../tokens";

describe("token primitives", () => {
  it("hashes deterministically to 64 hex chars", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates an sk_live token whose hash and prefix match the plaintext", () => {
    const token = generateToken();

    expect(token.plaintext.startsWith("sk_live_")).toBe(true);
    expect(token.prefix).toBe(token.plaintext.slice(0, 12));
    expect(token.hash).toBe(hashToken(token.plaintext));
  });
});

describe("verifyAgentToken", () => {
  function fakeClient(row: { workspace_id: string } | null) {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        }),
        update,
      }),
    } as never;
  }

  it("returns the workspace for a known, non-revoked token", async () => {
    const result = await verifyAgentToken("sk_live_known", fakeClient({ workspace_id: "default" }));

    expect(result).toEqual({ ok: true, workspaceId: "default" });
  });

  it("returns not-ok for an unknown token", async () => {
    const result = await verifyAgentToken("sk_live_nope", fakeClient(null));

    expect(result.ok).toBe(false);
  });
});
