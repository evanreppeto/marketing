import { describe, expect, it, vi, afterEach } from "vitest";

import { dispatchWebhook } from "./webhook-channel";
import type { ChannelDispatchInput } from "../registry";

afterEach(() => vi.restoreAllMocks());

function input(overrides: Partial<ChannelDispatchInput> = {}): ChannelDispatchInput {
  return {
    // The client isn't used by the webhook channel — it posts to a URL, not the DB.
    client: {} as ChannelDispatchInput["client"],
    orgId: "org",
    workspaceId: "ws",
    approvalId: "appr_1",
    payload: { body: "Approved copy", medium: "webhook", subject: "Hi" },
    config: { endpoint: "https://hooks.example/catch" },
    credential: null,
    ...overrides,
  };
}

describe("dispatchWebhook", () => {
  it("refuses to send without an approval on record", async () => {
    const res = await dispatchWebhook(input({ approvalId: "" }));
    expect(res.ok).toBe(false);
  });

  it("refuses when no endpoint is configured", async () => {
    const res = await dispatchWebhook(input({ config: {} }));
    expect(res.ok).toBe(false);
  });

  it("performs a real POST and returns a provider ref on success", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const res = await dispatchWebhook(input());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.providerRef).toBe("webhook:https://hooks.example/catch");
    // The approved body + approvalId are in the posted envelope.
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ type: "arc.approved_send", approvalId: "appr_1", body: "Approved copy" });
  });

  it("surfaces a delivery failure as an error result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: false, status: 502 }) as Response));
    const res = await dispatchWebhook(input());
    expect(res.ok).toBe(false);
  });
});
