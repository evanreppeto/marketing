import { afterEach, describe, expect, it, vi } from "vitest";

import { createArcClient } from "./arc-client";
import type { Config } from "./config";

const config: Config = {
  appApiBaseUrl: "https://app.example",
  arcAgentApiToken: "tok",
  webhookSecret: null,
  port: 8788,
  webhookPath: "/webhooks/growth-chat",
  maxConcurrentRuns: 4,
  maxConcurrentRunsPerWorkspace: 2,
};

function stubFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createArcClient tenant identity", () => {
  it("echoes the wake's workspace + org on every callback so the app scopes the write", async () => {
    const fetchMock = stubFetch();
    const client = createArcClient(config, { orgId: "org-1", workspaceId: "ws-1" });

    await client.postChatReply({ agentTaskId: "t1", body: "hi" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer tok");
    expect(headers["x-arc-workspace-id"]).toBe("ws-1");
    expect(headers["x-arc-org-id"]).toBe("org-1");
  });

  it("omits identity headers when a wake carries none (back-compat single-tenant)", async () => {
    const fetchMock = stubFetch();
    const client = createArcClient(config);

    await client.postChatReply({ agentTaskId: "t1", body: "hi" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-arc-workspace-id"]).toBeUndefined();
    expect(headers["x-arc-org-id"]).toBeUndefined();
  });
});
