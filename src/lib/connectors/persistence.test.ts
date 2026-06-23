import { describe, expect, it, vi } from "vitest";
import { recordConnectorTest, setConnectorCredentialRef, setConnectorEnabled } from "./persistence";

/** Capture the upsert/update payload + the workspace filter applied. */
function captureClient() {
  const calls: { payload?: unknown; filters: Record<string, string> } = { filters: {} };
  const eq = vi.fn((col: string, val: string) => {
    calls.filters[col] = val;
    return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) };
  });
  const client = {
    from: () => ({
      upsert: (payload: unknown) => {
        calls.payload = payload;
        return { error: null };
      },
      update: (payload: unknown) => {
        calls.payload = payload;
        return { eq };
      },
    }),
  } as never;
  return { client, calls };
}

describe("setConnectorEnabled", () => {
  it("filters the update by workspace_id and connector_key", async () => {
    const { client, calls } = captureClient();
    await setConnectorEnabled(client, { workspaceId: "ws-1", connectorKey: "gemini-research", enabled: true });
    expect(calls.payload).toMatchObject({ enabled: true });
    expect(calls.filters.workspace_id).toBe("ws-1");
    expect(calls.filters.connector_key).toBe("gemini-research");
  });
});

describe("setConnectorCredentialRef", () => {
  it("upserts a row with the credential ref scoped to the workspace", async () => {
    const { client, calls } = captureClient();
    await setConnectorCredentialRef(client, {
      workspaceId: "ws-1",
      orgId: "org-1",
      connectorKey: "gemini-research",
      credentialRef: "ref-9",
    });
    expect(calls.payload).toMatchObject({
      workspace_id: "ws-1",
      org_id: "org-1",
      connector_key: "gemini-research",
      credential_ref: "ref-9",
    });
  });
});

describe("recordConnectorTest", () => {
  it("clears the error on success", async () => {
    const { client, calls } = captureClient();
    await recordConnectorTest(client, { workspaceId: "ws-1", connectorKey: "gemini-research", result: { ok: true } });
    expect(calls.payload).toMatchObject({ last_test_ok: true, last_test_error: null });
  });
});
