import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connectors/read-model", () => ({ resolveConnectorCredentialRef: vi.fn() }));
vi.mock("@/lib/connectors/credentials", () => ({ readConnectorCredential: vi.fn() }));

import { readConnectorCredential } from "@/lib/connectors/credentials";
import { resolveConnectorCredentialRef } from "@/lib/connectors/read-model";

import { resolveWorkspaceMediaAccess } from "./access";

const refMock = vi.mocked(resolveConnectorCredentialRef);
const credMock = vi.mocked(readConnectorCredential);
const client = {} as never; // passed explicitly so the admin-client path isn't taken

const ORIGINAL = { ARC_MEDIA_ENABLED: process.env.ARC_MEDIA_ENABLED, GEMINI_API_KEY: process.env.GEMINI_API_KEY };

beforeEach(() => {
  refMock.mockReset();
  credMock.mockReset();
  delete process.env.ARC_MEDIA_ENABLED;
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("resolveWorkspaceMediaAccess", () => {
  it("uses the workspace's own Gemini key when its connector is connected", async () => {
    refMock.mockResolvedValue("ref-1");
    credMock.mockResolvedValue("ws-gemini-key");

    expect(await resolveWorkspaceMediaAccess("ws-1", client)).toEqual({
      enabled: true,
      apiKey: "ws-gemini-key",
      source: "workspace",
    });
  });

  it("falls back to the shared env key, gated by the global master flag", async () => {
    refMock.mockResolvedValue(null);
    process.env.ARC_MEDIA_ENABLED = "1";
    process.env.GEMINI_API_KEY = "env-key";

    expect(await resolveWorkspaceMediaAccess("ws-1", client)).toEqual({
      enabled: true,
      apiKey: "env-key",
      source: "env",
    });
  });

  it("is disabled when there's no workspace key and the flag is off, even if an env key exists", async () => {
    refMock.mockResolvedValue(null);
    process.env.GEMINI_API_KEY = "env-key"; // present, but ARC_MEDIA_ENABLED is unset

    expect(await resolveWorkspaceMediaAccess("ws-1", client)).toEqual({
      enabled: false,
      apiKey: null,
      source: "none",
    });
  });

  it("prefers the workspace key over the shared env key", async () => {
    refMock.mockResolvedValue("ref-1");
    credMock.mockResolvedValue("ws-key");
    process.env.ARC_MEDIA_ENABLED = "1";
    process.env.GEMINI_API_KEY = "env-key";

    const access = await resolveWorkspaceMediaAccess("ws-1", client);
    expect(access.source).toBe("workspace");
    expect(access.apiKey).toBe("ws-key");
  });
});
