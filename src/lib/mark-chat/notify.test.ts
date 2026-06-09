import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyMarkWebhook } from "./notify";

const ORIGINAL_ENV = { ...process.env };

function mockFetch(ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500 });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const basePayload = {
  type: "mark_chat_message" as const,
  messageId: "m1",
  conversationId: "c1",
  agentTaskId: "t1",
  message: "hi mark",
  mentions: [],
  operator: "Evan",
  route: "fast" as const,
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyMarkWebhook", () => {
  it("does nothing and reports not delivered when no runner URL is set", async () => {
    delete process.env.MARK_RUNNER_URL;
    delete process.env.MARK_WEBHOOK_URL;
    const fetchMock = mockFetch();

    const delivered = await notifyMarkWebhook(basePayload);

    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to MARK_RUNNER_URL when set (canonical name)", async () => {
    process.env.MARK_RUNNER_URL = "https://hermes.example/webhooks/runner";
    delete process.env.MARK_WEBHOOK_URL;
    const fetchMock = mockFetch();

    const delivered = await notifyMarkWebhook(basePayload);

    expect(delivered).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hermes.example/webhooks/runner");
  });

  it("prefers MARK_RUNNER_URL over the legacy MARK_WEBHOOK_URL alias", async () => {
    process.env.MARK_RUNNER_URL = "https://hermes.example/runner";
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/legacy";
    const fetchMock = mockFetch();

    await notifyMarkWebhook(basePayload);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hermes.example/runner");
  });

  it("falls back to the legacy MARK_WEBHOOK_URL when MARK_RUNNER_URL is unset", async () => {
    delete process.env.MARK_RUNNER_URL;
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/legacy";
    const fetchMock = mockFetch();

    const delivered = await notifyMarkWebhook(basePayload);

    expect(delivered).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hermes.example/legacy");
  });

  it("POSTs an event-driven payload carrying messageId, conversationId and the model route", async () => {
    delete process.env.MARK_RUNNER_URL;
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/webhooks/chat";
    delete process.env.MARK_WEBHOOK_SECRET;
    const fetchMock = mockFetch();

    const delivered = await notifyMarkWebhook(basePayload);

    expect(delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hermes.example/webhooks/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      type: "mark_chat_message",
      messageId: "m1",
      conversationId: "c1",
      route: "fast",
    });
  });

  it("signs the raw body with MARK_WEBHOOK_SECRET via the x-webhook-signature header", async () => {
    delete process.env.MARK_RUNNER_URL;
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/webhooks/chat";
    process.env.MARK_WEBHOOK_SECRET = "shh";
    const fetchMock = mockFetch();

    await notifyMarkWebhook(basePayload);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const expected = createHmac("sha256", "shh").update(String(init.body)).digest("hex");
    expect(headers["x-webhook-signature"]).toBe(expected);
  });

  it("reports not delivered on a non-2xx response so the task stays queued for the inbox fallback", async () => {
    delete process.env.MARK_RUNNER_URL;
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/webhooks/chat";
    mockFetch(false);

    const delivered = await notifyMarkWebhook(basePayload);

    expect(delivered).toBe(false);
  });

  it("never throws and reports not delivered when fetch rejects", async () => {
    delete process.env.MARK_RUNNER_URL;
    process.env.MARK_WEBHOOK_URL = "https://hermes.example/webhooks/chat";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(notifyMarkWebhook(basePayload)).resolves.toBe(false);
  });
});
