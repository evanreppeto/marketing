import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createEnvTemplate, createGrowthEngineClient, verifyWebhookSignature } from "./index.js";

describe("createGrowthEngineClient", () => {
  it("pings the hosted workspace with the bearer token", async () => {
    const calls = [];
    const client = createGrowthEngineClient({
      baseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ ok: true, status: "connected" });
      },
    });

    await expect(client.ping()).resolves.toEqual({ ok: true, status: "connected" });
    expect(calls).toEqual([
      {
        url: "https://acme.growthengine.com/api/v1/arc/ping",
        init: expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ authorization: "Bearer sk_live_test" }),
        }),
      },
    ]);
  });

  it("pulls messages and posts replies through the app contract", async () => {
    const calls = [];
    const client = createGrowthEngineClient({
      baseUrl: "https://acme.growthengine.com",
      token: "sk_live_test",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ ok: true, status: "ok" });
      },
    });

    await client.listMessages({ limit: 5 });
    await client.reply({ agentTaskId: "task-1", body: "Done", metadata: { source: "test" } });

    expect(calls[0].url).toBe("https://acme.growthengine.com/api/v1/arc/messages?limit=5");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[1].url).toBe("https://acme.growthengine.com/api/v1/arc/messages");
    expect(calls[1].init.method).toBe("POST");
    expect(JSON.parse(calls[1].init.body)).toEqual({
      agentTaskId: "task-1",
      body: "Done",
      status: "complete",
      metadata: { source: "test" },
    });
  });
});

describe("connector setup helpers", () => {
  it("renders the Arc-side env template", () => {
    expect(
      createEnvTemplate({
        baseUrl: "https://acme.growthengine.com/",
        token: "sk_live_test",
        webhookSecret: "shared",
      }),
    ).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
  });

  it("verifies app wake webhook HMAC signatures", () => {
    const body = JSON.stringify({ type: "arc_chat_message", agentTaskId: "task-1" });
    const signature = createHmac("sha256", "shared").update(body).digest("hex");

    expect(verifyWebhookSignature({ rawBody: body, signature, secret: "shared" })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: body, signature: "bad", secret: "shared" })).toBe(false);
  });
});
