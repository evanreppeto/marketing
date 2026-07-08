import { describe, expect, it, vi } from "vitest";
import { disconnectConnector, recordConnectorTest, setConnectorCredentialRef, setConnectorEnabled } from "./persistence";

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
    expect(Object.keys(calls.filters).length).toBe(2);
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

describe("disconnectConnector", () => {
  it("clears the credential ref, disables, and scopes to the workspace + connector", async () => {
    const { client, calls } = captureClient();
    await disconnectConnector(client, { workspaceId: "ws-1", connectorKey: "higgsfield" });
    expect(calls.payload).toMatchObject({ credential_ref: null, enabled: false });
    expect(calls.filters.workspace_id).toBe("ws-1");
    expect(calls.filters.connector_key).toBe("higgsfield");
    expect(Object.keys(calls.filters).length).toBe(2);
  });
});

describe("recordConnectorTest", () => {
  it("clears the error on success", async () => {
    const { client, calls } = captureClient();
    await recordConnectorTest(client, { workspaceId: "ws-1", connectorKey: "gemini-research", result: { ok: true } });
    expect(calls.payload).toMatchObject({ last_test_ok: true, last_test_error: null });
    expect(Object.keys(calls.filters).length).toBe(2);
  });

  it("records error when test fails with explicit error", async () => {
    const { client, calls } = captureClient();
    await recordConnectorTest(client, {
      workspaceId: "ws-1",
      connectorKey: "gemini-research",
      result: { ok: false, error: "Connection timeout" },
    });
    expect(calls.payload).toMatchObject({ last_test_ok: false, last_test_error: "Connection timeout" });
    expect(Object.keys(calls.filters).length).toBe(2);
  });

  it("uses default error message when test fails without explicit error", async () => {
    const { client, calls } = captureClient();
    await recordConnectorTest(client, {
      workspaceId: "ws-1",
      connectorKey: "gemini-research",
      result: { ok: false },
    });
    expect(calls.payload).toMatchObject({ last_test_ok: false, last_test_error: "Connection test failed." });
    expect(Object.keys(calls.filters).length).toBe(2);
  });
});
