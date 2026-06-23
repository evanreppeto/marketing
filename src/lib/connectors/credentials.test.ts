import { describe, expect, it, vi } from "vitest";
import { readConnectorCredential, writeConnectorCredential } from "./credentials";

function clientWithRpc(ref: string) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: ref, error: null }),
  } as unknown as Parameters<typeof writeConnectorCredential>[0];
}

describe("writeConnectorCredential", () => {
  it("creates a vault secret and returns its ref", async () => {
    const client = clientWithRpc("ref-123");
    const ref = await writeConnectorCredential(client, {
      workspaceId: "ws-1",
      connectorKey: "gemini-research",
      plaintext: "secret-key",
    });
    expect(ref).toBe("ref-123");
  });

  it("throws when the vault returns no id", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as never;
    await expect(
      writeConnectorCredential(client, { workspaceId: "ws-1", connectorKey: "gemini-research", plaintext: "k" }),
    ).rejects.toThrow();
  });
});

describe("readConnectorCredential", () => {
  it("returns the decrypted secret for a ref", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { decrypted_secret: "secret-key" }, error: null });
    const client = {
      schema: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
      }),
    } as never;
    expect(await readConnectorCredential(client, "ref-123")).toBe("secret-key");
  });

  it("returns null for a missing ref", async () => {
    expect(await readConnectorCredential({} as never, null)).toBeNull();
  });
});
