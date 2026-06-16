import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

function healthRequest(authorization?: string) {
  return new Request("http://localhost/api/v1/arc/health", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/v1/arc/health", () => {
  const original = process.env.ARC_AGENT_API_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.ARC_AGENT_API_TOKEN;
    else process.env.ARC_AGENT_API_TOKEN = original;
  });

  it("returns 503 when no token is configured", async () => {
    delete process.env.ARC_AGENT_API_TOKEN;
    const res = await GET(healthRequest("Bearer whatever"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
  });

  it("returns 401 on a bad token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(healthRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with the service name and DB readiness", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(healthRequest("Bearer secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "ok", service: "bsr-marketing-arc" });
    expect(typeof body.supabaseConfigured).toBe("boolean");
  });
});
