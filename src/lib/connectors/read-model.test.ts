import { describe, expect, it, vi } from "vitest";
import { listWorkspaceConnectors, resolveConnectorCredentialRef } from "./read-model";

function clientReturning(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  } as never;
}

describe("listWorkspaceConnectors", () => {
  it("merges registry catalog with workspace rows and computes status", async () => {
    const client = clientReturning([
      { connector_key: "gemini-research", enabled: true, credential_ref: "ref-1", last_test_ok: null, last_tested_at: null, last_test_error: null },
    ]);
    const views = await listWorkspaceConnectors(client, "ws-1");
    const gemini = views.find((v) => v.key === "gemini-research");
    expect(gemini?.status).toBe("connected");
    expect(gemini?.credentialPresent).toBe(true);
    // never leak the ref/secret in the view
    expect(gemini).not.toHaveProperty("credentialRef");
  });

  it("shows not_configured for a catalog connector with no row", async () => {
    const client = clientReturning([]);
    const views = await listWorkspaceConnectors(client, "ws-1");
    expect(views.find((v) => v.key === "gemini-research")?.status).toBe("not_configured");
  });
});

describe("resolveConnectorCredentialRef", () => {
  it("returns the ref for an enabled connector", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { credential_ref: "ref-1", enabled: true }, error: null });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    } as never;
    expect(await resolveConnectorCredentialRef(client, "ws-1", "gemini-research")).toBe("ref-1");
  });

  it("returns null when the connector is disabled", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { credential_ref: "ref-1", enabled: false }, error: null });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    } as never;
    expect(await resolveConnectorCredentialRef(client, "ws-1", "gemini-research")).toBeNull();
  });
});
