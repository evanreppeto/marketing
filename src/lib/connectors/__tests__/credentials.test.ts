import { describe, expect, it, vi } from "vitest";
import { updateConnectorCredential } from "../credentials";

function clientWithDirectRpc(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) } as never;
}

describe("updateConnectorCredential", () => {
  it("returns true when the direct update_secret RPC succeeds", async () => {
    const client = clientWithDirectRpc({ data: "ok", error: null });
    const ok = await updateConnectorCredential(client, "ref-1", "new-secret");
    expect(ok).toBe(true);
  });

  it("returns false (best-effort) when the RPC errors and no schema fallback exists", async () => {
    const client = clientWithDirectRpc({ data: null, error: { message: "nope" } });
    const ok = await updateConnectorCredential(client, "ref-1", "new-secret");
    expect(ok).toBe(false);
  });

  it("returns false when ref is null", async () => {
    const client = clientWithDirectRpc({ data: "ok", error: null });
    expect(await updateConnectorCredential(client, null, "x")).toBe(false);
  });
});
