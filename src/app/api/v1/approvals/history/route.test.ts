import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

function historyRequest(authorization?: string, query = "") {
  return new Request(`http://localhost/api/v1/approvals/history${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/v1/approvals/history", () => {
  const original = process.env.HERMES_AGENT_API_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.HERMES_AGENT_API_TOKEN;
    else process.env.HERMES_AGENT_API_TOKEN = original;
  });

  it("returns 503 when no token is configured", async () => {
    delete process.env.HERMES_AGENT_API_TOKEN;
    const res = await GET(historyRequest("Bearer whatever"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
  });

  it("returns 401 on a bad token", async () => {
    process.env.HERMES_AGENT_API_TOKEN = "secret";
    const res = await GET(historyRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });
});
